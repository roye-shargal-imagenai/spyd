import { toast } from "@odin/ui/sonner";
import { cn } from "@odin/ui/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { emojify } from "renderer/lib/emoji";
import { openUrl } from "renderer/stores/in-app-browser";
import { typeIntoClaude } from "../board/ChatView";
import { InlineAsk } from "../components/InlineAsk";
import { useNewWorkspaceDialog } from "../components/NewWorkspaceDialog";
import { cardBody } from "../components/OdinPromptDialog";
import { BUTTON } from "../components/pill";
import { StatusGlyph, useSidebarSessions } from "../components/SessionList";
import { SessionPane, useHomeSelection } from "../components/SessionPane";
import { COMPACT_MARKDOWN } from "../components/TranscriptView";
import { endSession } from "../hooks/useDone";
import { usePaneMeta } from "../hooks/usePaneMeta";
import { usePendingFocus } from "../hooks/usePendingFocus";
import type { SessionEntry } from "../hooks/useSessionSections";

export const Route = createFileRoute("/_authenticated/_odin/home/")({
	component: HomePage,
});

/**
 * Home - a mail client for your agents, and where you work with them. The
 * sessions on the left, grouped by what they want from you (Needs you first,
 * then Finished, Working, Idle); the one you pick on the right, either as a
 * summary - what it wants, what it last said, what it was asked - or as the
 * live session itself. No decoration: type, spacing and one accent colour.
 * Up/Down move, Enter opens the session, Esc goes back to the summary.
 */

const GROUPS: { column: string; title: string }[] = [
	{ column: "permission", title: "Needs you" },
	{ column: "review", title: "Finished" },
	{ column: "working", title: "Working" },
	{ column: "idle", title: "Idle" },
];

function HomePage() {
	const { sessions, ready } = useSidebarSessions();
	const selectedId = useHomeSelection((s) => s.paneId);
	const view = useHomeSelection((s) => s.view);
	const { select, setView } = useHomeSelection.getState();
	const selected =
		sessions.find((s) => s.pane.id === selectedId) ?? sessions[0] ?? null;
	const listRef = useRef<HTMLDivElement>(null);

	// Something elsewhere (Tasks, a toast) asked to open a session: open it here.
	const pendingPaneId = usePendingFocus((s) => s.paneId);
	useEffect(() => {
		if (!pendingPaneId || !sessions.some((s) => s.pane.id === pendingPaneId))
			return;
		select(pendingPaneId, "session");
		usePendingFocus.getState().clear();
	}, [pendingPaneId, sessions, select]);

	const move = (offset: number) => {
		if (!selected) return;
		const i = sessions.findIndex((s) => s.pane.id === selected.pane.id);
		const next =
			sessions[Math.min(Math.max(i + offset, 0), sessions.length - 1)];
		if (next) select(next.pane.id, view);
	};

	// Keep the selected row in view as the keyboard walks the list.
	useEffect(() => {
		if (!selected) return;
		listRef.current
			?.querySelector(`[data-pane="${selected.pane.id}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [selected]);

	if (ready && sessions.length === 0) return <EmptyHome />;

	return (
		<div className="flex h-full min-h-0">
			{/* biome-ignore lint/a11y/noStaticElementInteractions: the list owns arrow-key navigation */}
			<div
				ref={listRef}
				tabIndex={-1}
				onKeyDown={(event) => {
					if (event.key === "ArrowDown") {
						event.preventDefault();
						move(1);
					} else if (event.key === "ArrowUp") {
						event.preventDefault();
						move(-1);
					} else if (event.key === "Enter" && selected) {
						setView("session");
					} else if (event.key === "Escape") {
						setView("summary");
					}
				}}
				className="flex w-[320px] shrink-0 flex-col overflow-y-auto border-r border-border pb-4 outline-none"
			>
				{GROUPS.map((group) => {
					const items = sessions.filter((s) => s.column === group.column);
					if (items.length === 0) return null;
					const urgent = group.column === "permission";
					return (
						<section key={group.column}>
							<h2
								className={cn(
									"sticky top-0 z-10 flex items-baseline justify-between bg-background/95 px-4 pt-5 pb-2 text-[12px] font-semibold backdrop-blur",
									urgent ? "text-primary-ink" : "text-muted-foreground",
								)}
							>
								{group.title}
								<span className="font-normal tabular-nums">{items.length}</span>
							</h2>
							{items.map((entry) => (
								<ListRow
									key={entry.pane.id}
									entry={entry}
									selected={entry.pane.id === selected?.pane.id}
									onSelect={() => select(entry.pane.id, view)}
									onOpen={() => select(entry.pane.id, "session")}
								/>
							))}
						</section>
					);
				})}
			</div>

			<div className="flex min-w-0 flex-1 flex-col">
				{selected ? (
					<>
						<div className="flex shrink-0 items-center gap-1 border-b border-border px-4 py-2">
							{(["summary", "session"] as const).map((mode) => (
								<button
									key={mode}
									type="button"
									onClick={() => setView(mode)}
									className={cn(
										"rounded-[6px] px-3 py-1 text-[13px] font-medium capitalize",
										view === mode
											? "bg-accent text-foreground"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									{mode}
								</button>
							))}
							<span className="ml-2 min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
								{selected.title}
							</span>
						</div>
						<div className="min-h-0 flex-1 overflow-y-auto">
							{view === "session" ? (
								<SessionPane key={selected.pane.id} entry={selected} />
							) : (
								<Detail key={selected.pane.id} entry={selected} />
							)}
						</div>
					</>
				) : (
					<div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
						No session selected
					</div>
				)}
			</div>
		</div>
	);
}

function ago(at: number | undefined): string {
	if (!at) return "";
	const minutes = Math.round((Date.now() - at) / 60_000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.round(hours / 24)}d`;
}

const STATE: Record<string, string> = {
	permission: "Needs you",
	working: "Working",
	review: "Finished",
	idle: "Idle",
};

const SOURCE: Record<string, string> = {
	slack: "From Slack",
	night: "Night Agent",
};

function useSessionId(entry: SessionEntry): string | null {
	const mirrored = usePaneMeta((s) => s.sessionIdByPane[entry.pane.id]);
	return entry.pane.claudeSessionId ?? mirrored ?? null;
}

/** The repo the agent actually works in - not the catch-all launch folder. */
function useWork(entry: SessionEntry) {
	const sessionId = useSessionId(entry);
	const { data } = electronTrpc.repos.workingRepoName.useQuery(
		{ claudeSessionId: sessionId ?? "" },
		{ enabled: !!sessionId, retry: false, staleTime: 60_000 },
	);
	const cwd = entry.pane.odinCwd ?? entry.pane.initialCwd ?? "";
	return {
		repo: data?.name ?? cwd.split("/").filter(Boolean).pop() ?? "",
		pullRequests: data?.pullRequests ?? [],
	};
}

/** A message in the list: where, what, how fresh. */
function ListRow({
	entry,
	selected,
	onSelect,
	onOpen,
}: {
	entry: SessionEntry;
	selected: boolean;
	onSelect: () => void;
	onOpen: () => void;
}) {
	const { repo } = useWork(entry);
	const waiting = entry.column === "permission";
	return (
		<button
			type="button"
			data-pane={entry.pane.id}
			onClick={onSelect}
			onDoubleClick={onOpen}
			className={cn(
				"flex w-full gap-2.5 border-b border-border/60 px-4 py-3 text-left",
				selected ? "bg-primary text-primary-foreground" : "hover:bg-accent/40",
			)}
		>
			<StatusGlyph
				column={entry.column}
				className={cn(
					"mt-[3px]",
					selected && "[&>span]:border-white [&>span]:bg-white",
				)}
			/>
			<span className="min-w-0 flex-1">
				<span className="flex items-baseline gap-2">
					<span
						className={cn(
							"min-w-0 flex-1 truncate text-[13px]",
							waiting ? "font-semibold" : "font-medium",
						)}
					>
						{repo || "Session"}
					</span>
					<span
						className={cn(
							"shrink-0 text-[12px] tabular-nums",
							selected ? "text-primary-foreground/80" : "text-muted-foreground",
						)}
					>
						{ago(entry.pane.odinStatusAt)}
					</span>
				</span>
				<span
					className={cn(
						"mt-0.5 block truncate text-[13px]",
						selected ? "text-primary-foreground" : "text-soft-foreground",
					)}
				>
					{entry.title}
				</span>
				<span
					className={cn(
						"mt-0.5 block truncate text-[12px]",
						selected ? "text-primary-foreground/75" : "text-muted-foreground",
					)}
				>
					{[STATE[entry.column], SOURCE[entry.section]]
						.filter(Boolean)
						.join(" · ")}
				</span>
			</span>
		</button>
	);
}

/** The open session: what it wants, what it last said, what it was asked. */
function Detail({ entry }: { entry: SessionEntry }) {
	const { pane } = entry;
	const { repo, pullRequests } = useWork(entry);
	const sessionId = useSessionId(entry);
	const briefByPane = usePaneMeta((s) => s.briefByPane);
	const brief = pane.odinBrief ?? briefByPane[pane.id] ?? null;
	const body = cardBody(entry.title, brief);
	const { data: transcript } =
		electronTrpc.terminal.readClaudeTranscript.useQuery(
			{ sessionId: sessionId ?? "" },
			{ enabled: !!sessionId, retry: false, refetchInterval: 10_000 },
		);
	const lastWord = useMemo(
		() =>
			transcript?.messages.findLast(
				(m) => m.role === "assistant" && m.text.trim(),
			)?.text ?? null,
		[transcript],
	);
	const openSession = () => useHomeSelection.getState().setView("session");
	const write = electronTrpc.terminal.write.useMutation();
	const [replying, setReplying] = useState(false);
	const [showAll, setShowAll] = useState(false);
	const [note, setNote] = useState("");
	const unattended = entry.section === "night" || entry.section === "slack";
	const canReply = entry.column !== "idle";
	const when = ago(pane.odinStatusAt);

	const finish = (verb: string) => {
		endSession(pane.id);
		toast.success(`${verb} - ${entry.title.slice(0, 50)}`);
	};
	const sendBack = async () => {
		const text = note.trim();
		if (!text) return;
		try {
			await typeIntoClaude(write.mutateAsync, pane.id, text);
		} catch {
			toast.error("That session has ended - open it and resume first");
			return;
		}
		setNote("");
		setReplying(false);
		toast.success("Sent");
	};

	return (
		<article className="mx-auto flex max-w-[760px] flex-col gap-8 px-10 pt-8 pb-16 [overflow-wrap:anywhere]">
			<header className="flex flex-col gap-4">
				<div className="flex items-center gap-2">
					<div className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
						{[
							repo,
							STATE[entry.column],
							SOURCE[entry.section],
							when && (when === "now" ? "just now" : `${when} ago`),
						]
							.filter(Boolean)
							.join(" · ")}
					</div>
					{unattended && (
						<>
							<button
								type="button"
								title="It's good - take it off the list. Session History keeps it."
								onClick={() => finish("Approved")}
								className={cn(
									"rounded-[6px] px-3 py-1.5 text-[13px] font-medium",
									BUTTON.secondary,
								)}
							>
								Approve
							</button>
							<button
								type="button"
								title="Not wanted - end the session"
								onClick={() => finish("Dropped")}
								className={cn(
									"rounded-[6px] px-3 py-1.5 text-[13px] font-medium",
									BUTTON.secondary,
								)}
							>
								Drop
							</button>
						</>
					)}
					<button
						type="button"
						onClick={openSession}
						className={cn(
							"rounded-[6px] px-3 py-1.5 text-[13px] font-semibold",
							BUTTON.primary,
						)}
					>
						Open session
					</button>
				</div>
				<h2 className="text-[24px] font-semibold leading-tight tracking-[-0.01em]">
					{entry.title}
				</h2>
				{pullRequests.length > 0 && (
					<div className="flex flex-wrap gap-3 text-[13px]">
						{pullRequests.map((pr) => (
							<button
								key={pr.url}
								type="button"
								onClick={() => openUrl(pr.url)}
								className="text-link hover:underline"
							>
								{pr.repo} #{pr.number}
							</button>
						))}
					</div>
				)}
			</header>

			{entry.column === "permission" && sessionId && (
				<InlineAsk paneId={pane.id} sessionId={sessionId} />
			)}

			{lastWord && (
				<section className="flex flex-col gap-2">
					<h3 className="text-[12px] font-medium text-muted-foreground">
						Latest from the agent
					</h3>
					<MarkdownRenderer
						content={lastWord}
						className={cn(COMPACT_MARKDOWN, "text-[14px]! text-foreground!")}
					/>
				</section>
			)}

			{body && (
				<section className="flex flex-col gap-2">
					<h3 className="text-[12px] font-medium text-muted-foreground">
						What it was asked
					</h3>
					<p
						className={cn(
							"cursor-text select-text whitespace-pre-wrap text-[14px] leading-relaxed text-soft-foreground [overflow-wrap:anywhere]",
							!showAll && "line-clamp-[10]",
						)}
					>
						{emojify(body)}
					</p>
					{!showAll && body.split("\n").length > 10 && (
						<button
							type="button"
							onClick={() => setShowAll(true)}
							className="self-start text-[13px] text-muted-foreground hover:text-foreground"
						>
							Show more
						</button>
					)}
				</section>
			)}

			{canReply &&
				(replying ? (
					<section className="flex flex-col gap-2">
						<textarea
							// biome-ignore lint/a11y/noAutofocus: opened by a click on Reply
							autoFocus
							value={note}
							onChange={(e) => setNote(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
									void sendBack();
								if (e.key === "Escape") setReplying(false);
							}}
							placeholder="Reply to the agent - ⌘↵ to send"
							className="min-h-[96px] resize-none rounded-[6px] border border-border bg-card px-3 py-2.5 text-[14px] outline-none focus:border-primary"
						/>
						<div className="flex gap-2">
							<button
								type="button"
								disabled={!note.trim()}
								onClick={() => void sendBack()}
								className={cn(
									"rounded-[6px] px-3 py-1.5 text-[13px] font-semibold disabled:opacity-50",
									BUTTON.primary,
								)}
							>
								Send
							</button>
							<button
								type="button"
								onClick={() => setReplying(false)}
								className="rounded-[6px] px-3 py-1.5 text-[13px] text-muted-foreground hover:text-foreground"
							>
								Cancel
							</button>
						</div>
					</section>
				) : (
					<button
						type="button"
						onClick={() => setReplying(true)}
						className="self-start text-[13px] text-muted-foreground hover:text-foreground"
					>
						Reply to the agent…
					</button>
				))}
		</article>
	);
}

function EmptyHome() {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 text-center">
			<div className="text-[15px] font-semibold">No sessions</div>
			<p className="max-w-[320px] text-[13px] text-muted-foreground">
				Start a workspace from a repository in the sidebar, or press ⌘N.
			</p>
			<button
				type="button"
				onClick={() => useNewWorkspaceDialog.getState().open()}
				className={cn(
					"mt-2 rounded-[6px] px-3 py-1.5 text-[13px] font-semibold",
					BUTTON.primary,
				)}
			>
				New workspace
			</button>
		</div>
	);
}
