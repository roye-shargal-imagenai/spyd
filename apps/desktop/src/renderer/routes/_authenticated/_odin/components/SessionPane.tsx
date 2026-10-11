import { toast } from "@odin/ui/sonner";
import { cn } from "@odin/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { coldRestoreState } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/state";
import { Terminal } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/Terminal";
import * as terminalCache from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/v1-terminal-cache";
import { claudeCli } from "renderer/stores/claude-command";
import { useSessionView } from "renderer/stores/session-view";
import { useTabsStore } from "renderer/stores/tabs/store";
import { create } from "zustand";
import { ChatView } from "../board/ChatView";
import { usePaneMeta } from "../hooks/usePaneMeta";
import type { SessionEntry } from "../hooks/useSessionSections";

/**
 * Which session Home has open, and whether you're reading its summary or
 * working in it. A store, so the sidebar, ⌘K and ⌘1-9 can open a session
 * straight into Home from anywhere.
 */
export const useHomeSelection = create<{
	paneId: string | null;
	view: "summary" | "session";
	select: (paneId: string, view?: "summary" | "session") => void;
	setView: (view: "summary" | "session") => void;
}>((set) => ({
	paneId: null,
	view: "summary",
	select: (paneId, view = "summary") => set({ paneId, view }),
	setView: (view) => set({ view }),
}));

/**
 * Sessions that open on the terminal whatever the chat setting: an empty
 * workspace has no conversation yet, so its chat could only say "Starting"
 * until you typed - into a terminal it was hiding. In memory, bounded.
 */
export const useTerminalFirst = create<{
	ids: string[];
	add: (paneId: string) => void;
	remove: (paneId: string) => void;
}>((set) => ({
	ids: [],
	add: (paneId) => set((s) => ({ ids: [...s.ids.slice(-49), paneId] })),
	remove: (paneId) =>
		set((s) => ({ ids: s.ids.filter((id) => id !== paneId) })),
}));

/** Open a session in Home, live - from anywhere in the app. */
export function useOpenInHome() {
	const navigate = useNavigate();
	return (paneId: string) => {
		useHomeSelection.getState().select(paneId, "session");
		navigate({ to: "/home" });
	};
}

/**
 * The session itself, inside Home - what the Dev Board's drawer showed: the
 * chat (or the raw terminal, one click away) while the agent runs, and a way
 * back in once it has ended.
 */
export function SessionPane({
	entry,
	header,
}: {
	entry: SessionEntry;
	/** What sits left of the Chat / Terminal switch: the session's title. */
	header?: ReactNode;
}) {
	const { pane } = entry;
	const _navigate = useNavigate();
	const tab = useTabsStore((s) => s.tabs.find((t) => t.id === pane.tabId));
	const mirrored = usePaneMeta((s) => s.sessionIdByPane[pane.id]);
	const sessionId = pane.claudeSessionId ?? mirrored ?? null;
	const chat = useSessionView((s) => s.chat);
	const [chosenTerminal, chooseTerminal] = useState(!chat);
	const terminalFirst = useTerminalFirst((s) => s.ids.includes(pane.id));
	const asTerminal = chosenTerminal || terminalFirst;
	const setAsTerminal = (terminal: boolean) => {
		if (!terminal) useTerminalFirst.getState().remove(pane.id);
		chooseTerminal(terminal);
	};
	const { data: daemon } = electronTrpc.terminal.listDaemonSessions.useQuery(
		undefined,
		{ refetchInterval: 5_000 },
	);
	const alive = daemon?.sessions.some(
		(s) => s.sessionId === pane.id && s.isAlive,
	);
	const write = electronTrpc.terminal.write.useMutation();
	const utils = electronTrpc.useUtils();
	const kill = electronTrpc.terminal.kill.useMutation();
	const [resuming, setResuming] = useState(false);
	const cwd = pane.odinCwd ?? pane.cwd ?? pane.initialCwd ?? undefined;

	/**
	 * Bring an ended session back where it is: the same conversation, in the
	 * same pane, at a ready prompt - the way Superset reattaches. A session
	 * that died mid-turn gets "Continue" so it picks its work back up.
	 */
	const resume = async () => {
		if (resuming || !tab) return;
		setResuming(true);
		try {
			// Claude writes a transcript only once something is said, so a
			// session that ended before its first message has none. There's
			// nothing to lose there: start it fresh in the same place rather
			// than showing a dead end.
			let fresh = false;
			if (sessionId) {
				try {
					await utils.client.terminal.readClaudeTranscript.query({ sessionId });
				} catch (error) {
					if (String(error).includes("No transcript on this machine"))
						fresh = true;
				}
			}
			const diedWorking =
				useTabsStore.getState().panes[pane.id]?.status === "working";
			// Same id, so the chat, the card and a later Resume keep pointing at
			// this conversation.
			const command = fresh
				? sessionId
					? `${claudeCli()} --session-id ${sessionId}`
					: claudeCli()
				: `${
						sessionId
							? `${claudeCli()} --resume ${sessionId}`
							: `${claudeCli()} --continue`
					}${diedWorking ? " Continue" : ""}`;
			await kill.mutateAsync({ paneId: pane.id }).catch(() => {});
			coldRestoreState.delete(pane.id);
			terminalCache.dispose(pane.id);
			await new Promise((resolve) => setTimeout(resolve, 300));
			await utils.client.terminal.createOrAttach.mutate({
				paneId: pane.id,
				tabId: pane.tabId,
				workspaceId: tab.workspaceId,
				cwd,
				command: cwd ? `cd '${cwd}' && ${command}` : command,
				allowKilled: true,
			});
			useTabsStore.setState((state) => ({
				panes: {
					...state.panes,
					[pane.id]: {
						...state.panes[pane.id],
						status: "idle",
						odinParked: false,
						interrupted: false,
						completed: false,
					},
				},
			}));
			await utils.terminal.listDaemonSessions.invalidate();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			setResuming(false);
		}
	};

	// Opening an ended session is asking to work in it: bring it back once,
	// on arrival, instead of showing a dead end.
	const [autoTried, setAutoTried] = useState(false);
	useEffect(() => {
		if (daemon === undefined || alive || autoTried || !tab) return;
		setAutoTried(true);
		// The list polls every 5s, so a session launched a moment ago isn't
		// in it yet. Ask again before treating it as ended - resuming a live
		// one killed it and restarted it under a new id.
		void utils.client.terminal.listDaemonSessions
			.query()
			.then((fresh) => {
				if (fresh.sessions.some((s) => s.sessionId === pane.id && s.isAlive))
					return utils.terminal.listDaemonSessions.invalidate();
				return resume();
			})
			.catch(() => {});
		// biome-ignore lint/correctness/useExhaustiveDependencies: once per pane, on arrival
	}, [daemon, alive, tab, autoTried, resume]);

	// A live PTY must mount clean: a cached xterm or a cold-restore marker
	// from an earlier view leaves it read-only and keystrokes vanish (the
	// Dev Board's drawer does the same before it opens one).
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		if (pane.type === "terminal" && alive) {
			coldRestoreState.delete(pane.id);
			terminalCache.dispose(pane.id);
		}
		setMounted(true);
	}, [pane.id, pane.type, alive]);

	const interrupt = () => {
		write.mutate({ paneId: pane.id, data: "\x03" });
		useTabsStore.setState((state) => ({
			panes: {
				...state.panes,
				[pane.id]: { ...state.panes[pane.id], status: "idle" },
			},
		}));
	};

	if (daemon === undefined || !mounted || !tab) {
		return (
			<div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
				Connecting…
			</div>
		);
	}

	if (!alive) {
		return (
			<div className="flex h-full min-h-0 flex-col">
				{header && (
					<div className="shrink-0 border-b border-border px-[18px] py-3">
						{header}
					</div>
				)}
				<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
					<>
						<span className="size-5 animate-spin rounded-full border-2 border-faint-foreground border-t-transparent" />
						<div className="text-[14px] font-medium text-muted-foreground">
							{resuming ? "Bringing the session back…" : "Reconnecting…"}
						</div>
						{!resuming && (
							<button
								type="button"
								onClick={() => void resume()}
								className="rounded-md bg-secondary px-4 py-2 text-[13px] font-medium hover:bg-input"
							>
								Resume
							</button>
						)}
					</>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex shrink-0 items-center gap-3 border-b border-border px-[18px] py-3">
				<div className="min-w-0 flex-1">{header}</div>
				<div className="flex shrink-0 gap-0.5 rounded-full bg-tertiary p-[3px]">
					{(["chat", "terminal"] as const).map((mode) => {
						const active = (mode === "terminal") === asTerminal;
						return (
							<button
								key={mode}
								type="button"
								onClick={() => setAsTerminal(mode === "terminal")}
								className={cn(
									"h-[26px] rounded-md px-3 text-[12px] capitalize transition-colors",
									active
										? "bg-secondary font-medium text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{mode}
							</button>
						);
					})}
				</div>
			</div>
			<div className="flex min-h-0 flex-1 flex-col">
				{asTerminal ? (
					<div className="min-h-0 flex-1 bg-background p-2">
						<Terminal
							key={pane.id}
							paneId={pane.id}
							tabId={pane.tabId}
							workspaceId={tab.workspaceId}
						/>
					</div>
				) : (
					<ChatView
						key={pane.id}
						paneId={pane.id}
						sessionId={sessionId}
						cwd={pane.odinCwd ?? pane.cwd ?? pane.initialCwd ?? undefined}
						workspaceId={tab.workspaceId}
						working={entry.column === "working"}
						onShowTerminal={() => setAsTerminal(true)}
						onStop={interrupt}
					/>
				)}
			</div>
		</div>
	);
}
