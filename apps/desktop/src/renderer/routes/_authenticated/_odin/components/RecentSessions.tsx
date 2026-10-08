import { toast } from "@odin/ui/sonner";
import { cn } from "@odin/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { HiChevronRight } from "react-icons/hi2";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { useLaunchTaskSession } from "renderer/hooks/useLaunchTaskSession";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { profileOf } from "shared/odin-profile";
import { useOdinProfile } from "../hooks/useOdinProfile";
import { useOdinWorkspace } from "../hooks/useOdinWorkspace";
import { usePaneMeta } from "../hooks/usePaneMeta";
import type { SessionEntry } from "../hooks/useSessionSections";
import { BUTTON } from "./pill";
import { useHomeSelection } from "./SessionPane";
import { COMPACT_MARKDOWN } from "./TranscriptView";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Home selects a past session by this prefix, so it can't clash with a pane id. */
export const PAST = "past:";

export interface PastSession {
	id: string;
	title: string;
	cwd: string | null;
	sessionId: string;
	startedAt: number;
	source: string;
}

function ago(at: number): string {
	const minutes = Math.round((Date.now() - at) / 60_000);
	if (minutes < 60) return `${Math.max(minutes, 1)}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.round(hours / 24)}d`;
}

const place = (cwd: string | null) =>
	cwd?.split("/").filter(Boolean).pop() ?? "";

/**
 * Sessions from the last seven days that are no longer on the list - Done'd,
 * or ended and closed. Anything older lives in the Archive. One row per
 * conversation, the latest start wins.
 */
export function usePastWeek(live: SessionEntry[]): PastSession[] {
	const { data: ledger } = electronTrpc.workLog.list.useQuery(
		{ limit: 500 },
		{ refetchInterval: 60_000 },
	);
	const { activeId } = useOdinProfile();
	const sessionIdByPane = usePaneMeta((s) => s.sessionIdByPane);
	return useMemo(() => {
		const liveIds = new Set(
			live
				.map((e) => e.pane.claudeSessionId ?? sessionIdByPane[e.pane.id])
				.filter(Boolean),
		);
		const since = Date.now() - WEEK_MS;
		const seen = new Set<string>();
		const rows: PastSession[] = [];
		for (const row of ledger ?? []) {
			if (!row.sessionId || row.startedAt < since) continue;
			if (profileOf(row.profileId) !== activeId) continue;
			if (liveIds.has(row.sessionId) || seen.has(row.sessionId)) continue;
			seen.add(row.sessionId);
			rows.push({
				id: row.id,
				title: row.title,
				cwd: row.cwd,
				sessionId: row.sessionId,
				startedAt: row.startedAt,
				source: row.source,
			});
		}
		return rows;
	}, [ledger, live, sessionIdByPane, activeId]);
}

/** The list's last group: the past week, folded until you want it. */
export function PastWeekGroup({
	past,
	selectedId,
}: {
	past: PastSession[];
	selectedId: string | null;
}) {
	const [open, setOpen] = useState(false);
	const navigate = useNavigate();
	return (
		<section>
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="sticky top-0 z-10 flex w-full items-center gap-1.5 bg-background/95 px-4 pt-5 pb-2 text-left text-[12px] font-semibold text-muted-foreground backdrop-blur hover:text-foreground"
			>
				<HiChevronRight
					className={cn("size-3 transition-transform", open && "rotate-90")}
				/>
				<span className="flex-1">Past 7 days</span>
				<span className="font-normal tabular-nums">{past.length}</span>
			</button>
			{open && past.length === 0 && (
				<p className="px-4 pb-1 pl-[34px] text-[12px] text-muted-foreground">
					Nothing finished this week yet.
				</p>
			)}
			{open &&
				past.map((row) => {
					const selected = selectedId === `${PAST}${row.id}`;
					return (
						<button
							key={row.id}
							type="button"
							onClick={() =>
								useHomeSelection.getState().select(`${PAST}${row.id}`)
							}
							className={cn(
								"flex w-full flex-col border-b border-border/60 px-4 py-3 pl-[34px] text-left",
								selected
									? "bg-primary text-primary-foreground"
									: "hover:bg-accent/40",
							)}
						>
							<span className="flex items-baseline gap-2">
								<span className="min-w-0 flex-1 truncate text-[13px] font-medium">
									{place(row.cwd) || "Session"}
								</span>
								<span
									className={cn(
										"shrink-0 text-[12px] tabular-nums",
										selected
											? "text-primary-foreground/80"
											: "text-muted-foreground",
									)}
								>
									{ago(row.startedAt)}
								</span>
							</span>
							<span
								className={cn(
									"mt-0.5 truncate text-[13px]",
									selected ? "text-primary-foreground" : "text-soft-foreground",
								)}
							>
								{row.title}
							</span>
						</button>
					);
				})}
			<button
				type="button"
				onClick={() => navigate({ to: "/sessions" })}
				className="px-4 pt-3 pb-1 text-left text-[12px] text-muted-foreground hover:text-foreground"
			>
				Older sessions are in the Archive →
			</button>
		</section>
	);
}

/** A past session: what it was, the last thing it said, and Resume. */
export function PastDetail({ row }: { row: PastSession }) {
	const { ensureWorkspace } = useOdinWorkspace();
	const { launch, isLaunching } = useLaunchTaskSession();
	const { data: transcript } =
		electronTrpc.terminal.readClaudeTranscript.useQuery(
			{ sessionId: row.sessionId },
			{ retry: false, staleTime: 60_000 },
		);
	const lastWord = useMemo(
		() =>
			transcript?.messages.findLast(
				(m) => m.role === "assistant" && m.text.trim(),
			)?.text ?? null,
		[transcript],
	);

	// Same as the Archive's Resume: `claude --resume` in the directory it ran
	// in (the only place it can find the conversation), then open it here.
	const resume = async () => {
		if (!row.cwd) {
			toast.error("No directory recorded for this session - can't resume it");
			return;
		}
		const ensured = await ensureWorkspace(row.cwd);
		if (!ensured.ok) {
			toast.error(ensured.error);
			return;
		}
		const result = await launch({
			workspaceId: ensured.workspace.id,
			title: row.title,
			description: null,
			resumeSessionId: row.sessionId,
			repoPath: row.cwd,
		});
		if (!result.ok) {
			toast.error(result.error);
			return;
		}
		usePaneMeta.getState().setTitle(result.paneId, row.title);
		usePaneMeta.getState().setSessionId(result.paneId, result.sessionId);
		useHomeSelection.getState().select(result.paneId, "session");
	};

	return (
		<article className="mx-auto flex max-w-[760px] flex-col gap-8 px-10 pt-8 pb-16 [overflow-wrap:anywhere]">
			<header className="flex flex-col gap-4">
				<div className="flex items-center gap-2">
					<div className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
						{[place(row.cwd), "Ended", `started ${ago(row.startedAt)} ago`]
							.filter(Boolean)
							.join(" · ")}
					</div>
					<button
						type="button"
						disabled={isLaunching}
						onClick={() => void resume()}
						className={cn(
							"rounded-[6px] px-3 py-1.5 text-[13px] font-semibold disabled:opacity-50",
							BUTTON.primary,
						)}
					>
						{isLaunching ? "Resuming…" : "Resume"}
					</button>
				</div>
				<h2 className="text-[24px] font-semibold leading-tight tracking-[-0.01em]">
					{row.title}
				</h2>
			</header>
			{lastWord && (
				<section className="flex flex-col gap-2">
					<h3 className="text-[12px] font-medium text-muted-foreground">
						Where it left off
					</h3>
					<MarkdownRenderer
						content={lastWord}
						className={cn(COMPACT_MARKDOWN, "text-[14px]! text-foreground!")}
					/>
				</section>
			)}
		</article>
	);
}
