import { cn } from "@odin/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { coldRestoreState } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/state";
import { Terminal } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/Terminal";
import * as terminalCache from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/v1-terminal-cache";
import { useSessionView } from "renderer/stores/session-view";
import { useTabsStore } from "renderer/stores/tabs/store";
import { create } from "zustand";
import { ChatView } from "../board/ChatView";
import { usePaneMeta } from "../hooks/usePaneMeta";
import { usePendingFocus } from "../hooks/usePendingFocus";
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
	const navigate = useNavigate();
	const tab = useTabsStore((s) => s.tabs.find((t) => t.id === pane.tabId));
	const mirrored = usePaneMeta((s) => s.sessionIdByPane[pane.id]);
	const sessionId = pane.claudeSessionId ?? mirrored ?? null;
	const chat = useSessionView((s) => s.chat);
	const [asTerminal, setAsTerminal] = useState(!chat);
	const { data: daemon } = electronTrpc.terminal.listDaemonSessions.useQuery(
		undefined,
		{ refetchInterval: 5_000 },
	);
	const alive = daemon?.sessions.some(
		(s) => s.sessionId === pane.id && s.isAlive,
	);
	const write = electronTrpc.terminal.write.useMutation();

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
					<div className="shrink-0 border-b border-border px-4 py-2">
						{header}
					</div>
				)}
				<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
					<div className="text-[15px] font-semibold">
						This session has ended
					</div>
					<p className="max-w-[340px] text-[13px] text-muted-foreground">
						Its conversation is saved. Resume it to pick up where it left off.
					</p>
					<button
						type="button"
						onClick={() => {
							usePendingFocus.getState().focus(pane.id);
							navigate({ to: "/board" });
						}}
						className="rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:brightness-110"
					>
						Resume
					</button>
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
									"h-[26px] rounded-full px-3 text-[12px] capitalize transition-colors",
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
