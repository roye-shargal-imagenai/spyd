import { toast } from "@odin/ui/sonner";
import { cn } from "@odin/ui/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { HiPlus } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { openUrl } from "renderer/stores/in-app-browser";
import { InlineAsk } from "../components/InlineAsk";
import { useNewWorkspaceDialog } from "../components/NewWorkspaceDialog";
import { BUTTON } from "../components/pill";
import {
	PAST,
	PastDetail,
	PastWeekGroup,
	usePastWeek,
} from "../components/RecentSessions";
import { StatusGlyph, useSidebarSessions } from "../components/SessionList";
import { SessionPane, useHomeSelection } from "../components/SessionPane";
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
 * then Finished, Working, Idle); the one you pick on the right, as the
 * live session itself, opened as soon as you pick it. No decoration: type,
 * spacing and one accent colour. Up/Down move between sessions.
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
	const { select } = useHomeSelection.getState();
	const past = usePastWeek(sessions);
	const pastRow = selectedId?.startsWith(PAST)
		? (past.find((row) => `${PAST}${row.id}` === selectedId) ?? null)
		: null;
	const selected = pastRow
		? null
		: (sessions.find((s) => s.pane.id === selectedId) ?? sessions[0] ?? null);
	const listRef = useRef<HTMLDivElement>(null);

	// Something elsewhere (Tasks, a toast) asked to open a session: open it here.
	const pendingPaneId = usePendingFocus((s) => s.paneId);
	useEffect(() => {
		if (!pendingPaneId || !sessions.some((s) => s.pane.id === pendingPaneId))
			return;
		select(pendingPaneId);
		usePendingFocus.getState().clear();
	}, [pendingPaneId, sessions, select]);

	const move = (offset: number) => {
		if (!selected) return;
		const i = sessions.findIndex((s) => s.pane.id === selected.pane.id);
		const next =
			sessions[Math.min(Math.max(i + offset, 0), sessions.length - 1)];
		if (next) select(next.pane.id);
	};

	// Keep the selected row in view as the keyboard walks the list.
	useEffect(() => {
		if (!selected) return;
		listRef.current
			?.querySelector(`[data-pane="${selected.pane.id}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [selected]);

	if (ready && sessions.length === 0 && past.length === 0) return <EmptyHome />;

	return (
		<div className="flex h-full min-h-0 gap-2">
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
					}
				}}
				className="flex w-[340px] shrink-0 flex-col overflow-y-auto rounded-[24px] bg-background px-2 pb-4 ring-1 ring-inset ring-border outline-none"
			>
				<div className="flex items-baseline justify-between px-2.5 pt-[18px] pb-1">
					<h1 className="font-display text-[22px] font-bold tracking-[-0.02em]">
						Sessions
					</h1>
					<button
						type="button"
						onClick={() => useNewWorkspaceDialog.getState().open()}
						className={cn(
							"flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold",
							BUTTON.primary,
						)}
					>
						<HiPlus className="size-3" />
						New
					</button>
				</div>
				{GROUPS.map((group) => {
					const items = sessions.filter((s) => s.column === group.column);
					if (items.length === 0) return null;
					const urgent = group.column === "permission";
					return (
						<section key={group.column}>
							<h2
								className={cn(
									"sticky top-0 z-10 flex items-baseline gap-2 bg-background/95 px-2.5 pt-[18px] pb-1.5 text-[12px] font-semibold backdrop-blur",
									urgent ? "text-primary-ink" : "text-muted-foreground",
								)}
							>
								{group.title}
								<span className="font-normal tabular-nums text-faint-foreground">
									{items.length}
								</span>
							</h2>
							{items.map((entry) => (
								<ListRow
									key={entry.pane.id}
									entry={entry}
									selected={entry.pane.id === selected?.pane.id}
									onSelect={() => select(entry.pane.id)}
								/>
							))}
						</section>
					);
				})}
				<PastWeekGroup past={past} selectedId={selectedId} />
			</div>

			<div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[24px] bg-background ring-1 ring-inset ring-border">
				{pastRow ? (
					<div className="min-h-0 flex-1 overflow-y-auto">
						<PastDetail key={pastRow.id} row={pastRow} />
					</div>
				) : selected ? (
					<>
						<SessionPane
							key={selected.pane.id}
							entry={selected}
							header={<SessionHeader entry={selected} />}
						/>
						{selected.column === "permission" && (
							<WaitingTool key={`ask-${selected.pane.id}`} entry={selected} />
						)}
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
}: {
	entry: SessionEntry;
	selected: boolean;
	onSelect: () => void;
}) {
	const { repo } = useWork(entry);
	const waiting = entry.column === "permission";
	return (
		<button
			type="button"
			data-pane={entry.pane.id}
			onClick={onSelect}
			className={cn(
				"flex w-full gap-3 rounded-[16px] px-2.5 py-3 text-left transition-colors duration-150",
				selected ? "bg-secondary/80" : "hover:bg-accent/60",
			)}
		>
			<StatusGlyph column={entry.column} className="mt-[5px]" />
			<span className="flex min-w-0 flex-1 flex-col gap-[3px]">
				<span className="flex items-baseline gap-2">
					<span
						className={cn(
							"min-w-0 flex-1 truncate text-[13px] text-foreground",
							waiting ? "font-semibold" : "font-medium",
						)}
					>
						{entry.title}
					</span>
					<span className="shrink-0 text-[12px] tabular-nums text-faint-foreground">
						{ago(entry.pane.odinStatusAt)}
					</span>
				</span>
				<span className="truncate text-[12px] text-faint-foreground">
					{[repo, STATE[entry.column], SOURCE[entry.section]]
						.filter(Boolean)
						.join(" · ")}
				</span>
			</span>
		</button>
	);
}

/** The command it's stuck on, answered without typing into the terminal. */
function WaitingTool({ entry }: { entry: SessionEntry }) {
	const sessionId = useSessionId(entry);
	if (!sessionId) return null;
	return (
		<div className="shrink-0 border-t border-border px-4 py-3 empty:hidden">
			<InlineAsk paneId={entry.pane.id} sessionId={sessionId} toolsOnly />
		</div>
	);
}

/**
 * Above the live session: what it is, where, and - for work that started
 * without you (Slack, the Night Agent) - Approve or Drop.
 */
function SessionHeader({ entry }: { entry: SessionEntry }) {
	const { repo, pullRequests } = useWork(entry);
	const unattended = entry.section === "night" || entry.section === "slack";
	const when = ago(entry.pane.odinStatusAt);
	const finish = (verb: string) => {
		endSession(entry.pane.id);
		toast.success(`${verb} - ${entry.title.slice(0, 50)}`);
	};
	return (
		<div className="flex min-w-0 items-center gap-3">
			<div className="min-w-0 flex-1">
				<div className="truncate text-[14px] font-semibold">{entry.title}</div>
				<div className="flex min-w-0 gap-3 truncate text-[12px] text-muted-foreground">
					<span className="truncate">
						{[
							repo,
							STATE[entry.column],
							SOURCE[entry.section],
							when && (when === "now" ? "just now" : `${when} ago`),
						]
							.filter(Boolean)
							.join(" · ")}
					</span>
					{pullRequests.map((pr) => (
						<button
							key={pr.url}
							type="button"
							onClick={() => openUrl(pr.url)}
							className="shrink-0 text-link hover:underline"
						>
							{pr.repo} #{pr.number}
						</button>
					))}
				</div>
			</div>
			{unattended &&
				(["Approve", "Drop"] as const).map((verb) => (
					<button
						key={verb}
						type="button"
						title={
							verb === "Approve"
								? "It's good - take it off the list. The Archive keeps it."
								: "Not wanted - end the session"
						}
						onClick={() => finish(verb === "Approve" ? "Approved" : "Dropped")}
						className={cn(
							"rounded-full px-3 py-1 text-[12px] font-medium",
							BUTTON.secondary,
						)}
					>
						{verb}
					</button>
				))}
		</div>
	);
}

function EmptyHome() {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 rounded-[24px] bg-background text-center ring-1 ring-inset ring-border">
			<div className="font-display text-[22px] font-bold tracking-[-0.02em]">
				No sessions
			</div>
			<p className="max-w-[320px] text-[13px] text-muted-foreground">
				Start a workspace from a repository in the sidebar, or press ⌘N.
			</p>
			<button
				type="button"
				onClick={() => useNewWorkspaceDialog.getState().open()}
				className={cn(
					"mt-2 rounded-full px-4 py-2 text-[13px] font-semibold",
					BUTTON.primary,
				)}
			>
				New workspace
			</button>
		</div>
	);
}
