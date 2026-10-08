import { cn } from "@odin/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { PaneStatus } from "shared/tabs-types";
import { usePaneMeta } from "../hooks/usePaneMeta";
import { usePendingFocus } from "../hooks/usePendingFocus";
import {
	type SessionEntry,
	useSessionSections,
} from "../hooks/useSessionSections";
import { describeTool } from "./InlineAsk";

/**
 * A session's state as a shape, so it reads without colour too:
 *   working  - a small spinner
 *   needs you - a solid dot in the accent's light tint (the loudest thing on screen)
 *   ready    - a hollow green ring: it finished, have a look
 *   idle     - nothing
 */
export function StatusGlyph({
	column,
	className,
}: {
	column: PaneStatus;
	className?: string;
}) {
	return (
		<span
			aria-hidden
			className={cn(
				"flex size-3 shrink-0 items-center justify-center",
				className,
			)}
		>
			{column === "working" ? (
				<span className="size-2.5 animate-spin rounded-full border-[1.5px] border-working border-t-transparent" />
			) : column === "permission" ? (
				<span className="size-2 rounded-full bg-primary-ink" />
			) : column === "review" ? (
				<span className="size-2 rounded-full border-[1.5px] border-success" />
			) : null}
		</span>
	);
}

const URGENCY: Record<string, number> = {
	permission: 0,
	review: 1,
	working: 2,
	idle: 3,
};

/**
 * The sidebar's order, and the one ⌘1-9 and ⌘J walk: what wants you first
 * (longest waiting at the top), then what finished, then what's running,
 * then the rest - newest first within each.
 */
export function useSidebarSessions(): {
	sessions: SessionEntry[];
	ready: boolean;
} {
	const { entries, ready } = useSessionSections();
	const sessions = useMemo(
		() =>
			entries.toSorted((a, b) => {
				const byUrgency = (URGENCY[a.column] ?? 9) - (URGENCY[b.column] ?? 9);
				if (byUrgency !== 0) return byUrgency;
				const at = (e: SessionEntry) => e.pane.odinStatusAt ?? 0;
				return a.column === "permission" ? at(a) - at(b) : at(b) - at(a);
			}),
		[entries],
	);
	return { sessions, ready };
}

/** Open a session: the Dev Board shows it in its drawer. */
export function useOpenSession() {
	const navigate = useNavigate();
	return (paneId: string) => {
		usePendingFocus.getState().focus(paneId);
		navigate({ to: "/board" });
	};
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

/**
 * Where it works and where it came from, for the row's quiet second line.
 * `repo` is where the agent actually went - a feed session starts in the
 * catch-all folder, whose name says nothing.
 */
function meta(entry: SessionEntry, repo: string | undefined): string {
	const { pane } = entry;
	const cwd = pane.odinCwd ?? pane.cwd ?? pane.initialCwd ?? "";
	const place = repo ?? cwd.split("/").filter(Boolean).pop() ?? "";
	const source =
		entry.section === "night"
			? "Night Agent"
			: entry.section === "slack"
				? "Slack"
				: null;
	return [place, source, ago(pane.odinStatusAt)].filter(Boolean).join(" · ");
}

/**
 * Every session, one list, most urgent first - no section headings to read
 * past. Two lines a row: what it is, and in muted type where it runs, where
 * it came from and how long it's been. The first nine carry their ⌘ number.
 */
export function SessionList() {
	const { sessions, ready } = useSidebarSessions();
	const open = useOpenSession();
	const needsYou = sessions.filter((s) => s.column === "permission").length;

	return (
		<div className="flex flex-col gap-0.5">
			<div className="flex items-center justify-between px-2.5 pb-1.5 font-display text-[14px] font-bold text-soft-foreground">
				<span>Sessions</span>
				{needsYou > 0 ? (
					<span className="font-sans text-[12px] font-semibold text-primary-ink">
						{needsYou} need{needsYou === 1 ? "s" : ""} you
					</span>
				) : (
					sessions.length > 0 && (
						<span className="font-sans text-[12px] font-medium tabular-nums text-faint-foreground">
							{sessions.length}
						</span>
					)
				)}
			</div>
			{ready && sessions.length === 0 && (
				<p className="px-2.5 py-1 text-[12px] leading-relaxed text-faint-foreground">
					Nothing running. Press + on a repository, or ⌘N.
				</p>
			)}
			{sessions.map((entry, i) => (
				<SessionRow
					key={entry.pane.id}
					entry={entry}
					index={i}
					onOpen={() => open(entry.pane.id)}
				/>
			))}
		</div>
	);
}

function SessionRow({
	entry,
	index,
	onOpen,
}: {
	entry: SessionEntry;
	index: number;
	onOpen: () => void;
}) {
	const mirrored = usePaneMeta((s) => s.sessionIdByPane[entry.pane.id]);
	const sessionId = entry.pane.claudeSessionId ?? mirrored ?? null;
	// Same query the board's repo pill runs - a cache hit, not a new read.
	const { data: work } = electronTrpc.repos.workingRepoName.useQuery(
		{ claudeSessionId: sessionId ?? "" },
		{ enabled: !!sessionId, retry: false, staleTime: 60_000 },
	);
	// Waiting on you: say for what, instead of where.
	const waiting = entry.column === "permission" && !!sessionId;
	const { data: tool } = electronTrpc.terminal.pendingTool.useQuery(
		{ sessionId: sessionId ?? "" },
		{ enabled: waiting, refetchInterval: 5_000, retry: false },
	);
	const asking = tool
		? tool.name === "AskUserQuestion"
			? "Asked you a question"
			: tool.name === "ExitPlanMode"
				? "Wants a plan approved"
				: (() => {
						const { verb, detail } = describeTool(tool.name, tool.input);
						return `${verb} ${detail}`;
					})()
		: null;
	return (
		<button
			type="button"
			title={entry.title}
			onClick={onOpen}
			className={cn(
				"group flex w-full items-start gap-2 rounded-[6px] px-2.5 py-1.5 text-left transition-colors hover:bg-accent/60",
				entry.column === "permission" && "bg-primary/[0.08]",
			)}
		>
			<StatusGlyph column={entry.column} className="mt-[3px]" />
			<span className="min-w-0 flex-1">
				<span
					className={cn(
						"block truncate text-[13px] leading-5",
						entry.column === "idle"
							? "text-muted-foreground"
							: "text-foreground",
					)}
				>
					{entry.title}
				</span>
				<span className="block truncate text-[11px] leading-4 text-faint-foreground">
					{waiting && asking ? (
						<span className="text-primary-ink">{asking}</span>
					) : (
						meta(entry, work?.name ?? undefined)
					)}
				</span>
			</span>
			{index < 9 && (
				<span className="mt-[2px] shrink-0 text-[10px] text-faint-foreground opacity-0 transition-opacity group-hover:opacity-100">
					⌘{index + 1}
				</span>
			)}
		</button>
	);
}
