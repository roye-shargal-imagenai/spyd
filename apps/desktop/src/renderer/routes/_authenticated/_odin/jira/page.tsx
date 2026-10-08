import { toast } from "@odin/ui/sonner";
import { cn } from "@odin/ui/utils";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { JiraIssueRow, PullRequestRow } from "lib/trpc/routers/work";
import { useMemo, useState } from "react";
import { SiJira } from "react-icons/si";
import { ConnectNotice } from "renderer/components/ConnectProvider/ConnectProvider";
import { useLaunchTaskSession } from "renderer/hooks/useLaunchTaskSession";
import { openUrl } from "renderer/stores/in-app-browser";
import { useTabsStore } from "renderer/stores/tabs/store";
import { DoneButton } from "../components/DoneButton";
import {
	FEED_LIST,
	FEED_ROW,
	FeedDivider,
	FeedHeader,
	FeedSearch,
	FeedSelect,
	FilterPill,
	ROW_LIVE_BUTTON,
	ROW_PRIMARY_SLOT,
	ROW_START_BUTTON,
	SyncButton,
} from "../components/FeedChrome";
import { FeedError } from "../components/FeedError";
import { FullTitle } from "../components/FullTitle";
import { PersonChip } from "../components/PersonChip";
import { PILL } from "../components/pill";
import { DueChip, OverdueMark } from "../components/Reminders";
import { askSessionContext } from "../components/SessionContextDialog";
import { TonightToggle } from "../components/TonightToggle";
import { buildIssuePrompt } from "../feed-prompts";
import { useDone } from "../hooks/useDone";
import { useOdinFeeds } from "../hooks/useOdinFeeds";
import { useOdinWorkspace } from "../hooks/useOdinWorkspace";
import { usePendingFocus } from "../hooks/usePendingFocus";
import { reviewPullFor } from "./review-pull";

/** A row as Done wants it: its All-feed key, and enough to list it later. */
const doable = (issue: { key: string; title: string; url: string }) => ({
	key: `jira:${issue.key}`,
	title: `${issue.key}: ${issue.title}`,
	source: "Jira",
	url: issue.url,
});

export const Route = createFileRoute("/_authenticated/_odin/jira/")({
	component: MyJiraPage,
});

/**
 * My Jira - open issues assigned to me, ones I filed (BUGT triage tickets are
 * reported by me, not assigned), and ones where a comment @-mentions me; split
 * by role, grouped by status category, with one click to start an agent session
 * on one (or jump to a running one).
 */

const CATEGORY_ORDER = ["In Progress", "To Do", "Done"];
const categoryRank = (c: string) => {
	const i = CATEGORY_ORDER.findIndex(
		(x) => x.toLowerCase() === c.toLowerCase(),
	);
	return i === -1 ? CATEGORY_ORDER.length : i;
};
const isHotPriority = (p: string | null) =>
	/highest|urgent|critical|p0|p1|high/i.test(p ?? "");

// Jira's "In Progress" category lumps Open / On Hold / In Review / rejected
// together, so the status chip is toned to say which of those are parked.
// Blue means one thing only: an Odin session is running on the ticket.
type Tone = "review" | "parked" | "idle";
const statusTone = (status: string): Tone => {
	const s = status.toLowerCase();
	if (/hold|block|reject|pend|wait|defer/.test(s)) return "parked";
	if (/review|qa|verif|test|approv/.test(s)) return "review";
	return "idle";
};
const TONE_CHIP: Record<Tone, string> = {
	review: PILL.working,
	parked: PILL.attention,
	idle: "bg-secondary text-muted-foreground",
};

function shortDate(iso: string | null): string | null {
	if (!iso) return null;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return null;
	return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const ROLE_TABS = [
	{ id: "assigned" as const, label: "Assigned" },
	{ id: "reported" as const, label: "I filed" },
	{ id: "mentioned" as const, label: "Mentions" },
	{ id: "all" as const, label: "All" },
];

/** The "why is this here" chip on every row - unless a PR on it waits on my review. */
const ROLE_BADGE = {
	assigned: { label: "mine", className: PILL.neutral },
	reported: { label: "I filed", className: PILL.neutral },
	mentioned: { label: "@me", className: PILL.attention },
};
type Role = (typeof ROLE_TABS)[number]["id"];

function MyJiraPage() {
	const [projectFilter, setProjectFilter] = useState("");
	// Default to All: BUGT tickets are reported-not-assigned, and hiding them
	// behind a tab made "my Jira" look like it was missing whole projects.
	const [role, setRole] = useState<Role>("all");
	// Free text over key, title, reporter, status and project.
	const [search, setSearch] = useState("");
	// Sprints, the way Jira's board lists them, or by where each ticket stands.
	const [groupBy, setGroupBy] = useState<"sprint" | "status">("sprint");
	const needle = search.trim().toLowerCase();
	// Same feeds the shell warms on boot - rows are usually already cached.
	const {
		jira: issuesQuery,
		pulls: pullsQuery,
		workConfig: config,
		syncAll,
		isSyncing,
	} = useOdinFeeds();
	const { ensureWorkspace } = useOdinWorkspace();
	const { launch, isLaunching, launchingKey } = useLaunchTaskSession();
	const navigate = useNavigate();
	const panes = useTabsStore((s) => s.panes);

	// Done tickets drop out before the role tabs are counted.
	const { isDone, markDone } = useDone();
	const allIssues = useMemo(
		() =>
			(issuesQuery.data?.issues ?? []).filter(
				(issue) => !isDone({ ...doable(issue), mention: issue.mention }),
			),
		[issuesQuery.data, isDone],
	);
	const roleCounts = useMemo(
		() => ({
			assigned: allIssues.filter((i) => i.role === "assigned").length,
			reported: allIssues.filter((i) => i.role === "reported").length,
			mentioned: allIssues.filter((i) => i.role === "mentioned").length,
			all: allIssues.length,
		}),
		[allIssues],
	);
	// BUGT tickets are ones I filed, not ones assigned to me - hence the split.
	const issues = useMemo(
		() =>
			role === "all" ? allIssues : allIssues.filter((i) => i.role === role),
		[allIssues, role],
	);

	// Issue key → the pane of the session running on it (pane task titles are
	// persisted as `KEY: title`). One pass, so rows and counts share it.
	const livePaneByKey = useMemo(() => {
		const map = new Map<string, string>();
		for (const pane of Object.values(panes))
			if (!pane.completed && pane.odinTaskTitle)
				map.set(pane.odinTaskTitle.split(":")[0], pane.id);
		return map;
	}, [panes]);

	// Issue key → the open PR on it that's waiting on me (see reviewPullFor).
	const reviewPullByKey = useMemo(() => {
		const pulls = pullsQuery.data?.pulls ?? [];
		const map = new Map<string, PullRequestRow>();
		for (const issue of allIssues) {
			const pull = reviewPullFor(issue.key, pulls);
			if (pull) map.set(issue.key, pull);
		}
		return map;
	}, [allIssues, pullsQuery.data]);

	const projects = useMemo(() => {
		const counts = new Map<string, number>();
		for (const issue of issues)
			counts.set(issue.project, (counts.get(issue.project) ?? 0) + 1);
		return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	}, [issues]);

	// Group by status category (In Progress first), then keep Jira's updated order.
	const groups = useMemo(() => {
		const filtered = issues
			.filter((issue) => !projectFilter || issue.project === projectFilter)
			.filter(
				(issue) =>
					!needle ||
					`${issue.key} ${issue.title} ${issue.reporter ?? ""} ${issue.status} ${issue.project}`
						.toLowerCase()
						.includes(needle),
			);
		const byCategory = new Map<string, typeof issues>();
		for (const issue of filtered) {
			const key = issue.statusCategory;
			(byCategory.get(key) ?? byCategory.set(key, []).get(key))?.push(issue);
		}
		// Tickets with a live Odin session to the top of their group, parked ones
		// to the bottom; Jira's updated order survives inside each band.
		const rank = (issue: (typeof issues)[number]) =>
			livePaneByKey.has(issue.key)
				? 0
				: statusTone(issue.status) === "parked"
					? 2
					: 1;
		for (const rows of byCategory.values())
			rows.sort((a, b) => rank(a) - rank(b));
		if (groupBy === "status")
			return [...byCategory.entries()]
				.sort((a, b) => categoryRank(a[0]) - categoryRank(b[0]))
				.map(
					([category, rows]): IssueGroup => ({
						id: category,
						label: category,
						sprint: null,
						inProgress: category.toLowerCase() === "in progress",
						rows,
					}),
				);
		// Jira's board order: the active sprint, the ones coming up, then the
		// Backlog. Inside a sprint, where each ticket stands (In Progress first).
		const bySprint = new Map<string, IssueGroup>();
		for (const issue of filtered) {
			const sprint = issue.sprint ?? null;
			const id = sprint ? `sprint:${sprint.name}` : "backlog";
			const group =
				bySprint.get(id) ??
				bySprint
					.set(id, {
						id,
						label: sprint?.name ?? "Backlog",
						sprint,
						inProgress: false,
						rows: [],
					})
					.get(id);
			group?.rows.push(issue);
		}
		const order = (group: IssueGroup) =>
			!group.sprint ? 2 : group.sprint.state === "active" ? 0 : 1;
		const groups = [...bySprint.values()].sort(
			(a, b) =>
				order(a) - order(b) ||
				(a.sprint?.startDate ?? "~").localeCompare(b.sprint?.startDate ?? "~"),
		);
		for (const group of groups)
			group.rows.sort(
				(a, b) =>
					categoryRank(a.statusCategory) - categoryRank(b.statusCategory) ||
					rank(a) - rank(b),
			);
		return groups;
	}, [issues, projectFilter, needle, livePaneByKey, groupBy]);

	const handleStart = async (issue: (typeof issues)[number]) => {
		const title = `${issue.key}: ${issue.title}`;
		const context = await askSessionContext(title);
		if (!context) return;
		const ensured = await ensureWorkspace();
		if (!ensured.ok) return toast.error(ensured.error);
		const result = await launch({
			...context,
			key: issue.key,
			workspaceId: ensured.workspace.id,
			title,
			description: buildIssuePrompt(issue.key, issue.url, issue.title),
			contact: issue.reporter,
			brief: `${title}\n${issue.url}`,
			source: "jira",
		});
		if (result.ok) {
			usePendingFocus.getState().focus(result.paneId);
			navigate({ to: "/home" });
		} else {
			toast.error(result.error);
		}
	};

	return (
		<div className="flex h-full flex-col">
			<FeedHeader>
				<FeedDivider />
				{ROLE_TABS.map((tab) => (
					<FilterPill
						key={tab.id}
						active={role === tab.id}
						count={roleCounts[tab.id]}
						onClick={() => {
							setRole(tab.id);
							setProjectFilter("");
						}}
					>
						{tab.label}
					</FilterPill>
				))}
				<div className="ml-auto flex items-center gap-2.5">
					<fieldset
						aria-label="Group issues by"
						className="m-0 flex gap-0.5 rounded-full border-0 bg-tertiary p-[3px]"
					>
						{(["sprint", "status"] as const).map((mode) => (
							<button
								key={mode}
								type="button"
								aria-pressed={groupBy === mode}
								onClick={() => setGroupBy(mode)}
								className={cn(
									"h-[26px] rounded-full px-3 text-[12px] transition-colors",
									groupBy === mode
										? "bg-secondary font-medium text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{mode === "sprint" ? "Sprints" : "Status"}
							</button>
						))}
					</fieldset>
					<FeedSearch
						value={search}
						onChange={setSearch}
						label="Search Jira issues"
					/>
					{projects.length > 0 && (
						<FeedSelect
							value={projectFilter}
							onChange={setProjectFilter}
							title="Filter by project"
						>
							<option value="">All projects ({issues.length})</option>
							{projects.map(([project, count]) => (
								<option key={project} value={project}>
									{project} ({count})
								</option>
							))}
						</FeedSelect>
					)}
					<SyncButton isSyncing={isSyncing} onClick={() => void syncAll()} />
				</div>
			</FeedHeader>

			<div className={FEED_LIST}>
				{config && !config.hasJira && (
					<ConnectNotice
						provider="jira"
						text="Jira isn't connected - sign in to see the issues assigned to you."
					/>
				)}
				<FeedError error={issuesQuery.error} />
				{issuesQuery.data && issues.length === 0 && (
					<div className="px-2 py-8 text-center text-xs text-muted-foreground">
						Nothing assigned to you 🎉
					</div>
				)}
				{needle && issues.length > 0 && groups.length === 0 && (
					<div className="px-2 py-8 text-center text-xs text-muted-foreground">
						No issues match your search
					</div>
				)}

				{groups.map(({ id, label, sprint, inProgress, rows }) => (
					<div key={id} className={cn("mb-1", groupBy === "sprint" && "mb-4")}>
						{groupBy === "sprint" ? (
							<SprintHeading label={label} sprint={sprint} rows={rows} />
						) : null}
						<div
							className={cn(
								"flex items-center gap-2 py-1 pl-1 text-[11px] font-medium uppercase tracking-[.3px] text-muted-foreground",
								groupBy === "sprint" && "hidden",
							)}
						>
							<span
								className={cn(
									"size-1.5 rounded-full",
									inProgress ? "bg-working" : "bg-muted-foreground",
								)}
							/>
							{label}
							<span className="rounded-[12px] bg-secondary px-1.5 font-medium text-muted-foreground">
								{rows.length}
							</span>
							{(() => {
								const live = rows.filter((r) =>
									livePaneByKey.has(r.key),
								).length;
								return live > 0 ? (
									<span className="rounded-[12px] bg-working/12 px-1.5 font-medium text-working">
										{live} live
									</span>
								) : null;
							})()}
						</div>
						<div className="flex flex-col gap-1.5">
							{rows.map((issue) => {
								const activePaneId = livePaneByKey.get(issue.key) ?? null;
								const date = shortDate(issue.updated);
								const tone = statusTone(issue.status);
								const reviewPull = reviewPullByKey.get(issue.key);
								return (
									<div
										key={issue.key}
										className={cn(
											FEED_ROW,
											activePaneId && "border-l-2 border-l-working",
											!activePaneId && tone === "parked" && "opacity-60",
										)}
									>
										{/* Two lines, read top to bottom: what the ticket is, then
										    where it stands. The actions wait at the right edge. */}
										<div className="flex items-start gap-3">
											<StatusIcon
												category={issue.statusCategory}
												status={issue.status}
											/>
											<div className="flex min-w-0 flex-1 flex-col gap-1.5">
												<FullTitle
													text={issue.title}
													detail={[issue.key, issue.status, issue.sprint?.name]
														.filter(Boolean)
														.join(" · ")}
												>
													<span className="line-clamp-2 text-[14px] font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">
														<OverdueMark
															itemKey={`jira:${issue.key}`}
															upstream={issue.dueDate}
														/>
														{issue.title}
													</span>
												</FullTitle>
												<div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px]">
													<button
														type="button"
														onClick={() => openUrl(issue.url)}
														title="Open in Jira"
														className="flex h-6 items-center gap-1 rounded-full bg-secondary px-2.5 font-mono text-[11.5px] font-semibold text-soft-foreground transition-colors hover:bg-input hover:text-foreground"
													>
														<SiJira
															className="size-3 text-[#4c9aff]"
															aria-hidden
														/>
														{issue.key}
													</button>
													<span
														className={cn(
															"flex h-6 items-center rounded-full px-2.5 font-semibold",
															TONE_CHIP[tone],
														)}
													>
														{issue.status}
													</span>
													{(issue.mention ||
														(issue.priority &&
															isHotPriority(issue.priority))) && (
														<span
															className={cn(
																"flex h-6 items-center rounded-full px-2.5 font-semibold",
																PILL.danger,
															)}
														>
															{issue.mention ? "High" : issue.priority}
														</span>
													)}
													{activePaneId && (
														<span
															className={cn(
																"flex h-6 items-center gap-1.5 rounded-full px-2.5 font-semibold",
																PILL.working,
															)}
														>
															<span className="size-1.5 animate-pulse rounded-full bg-current" />
															Live
														</span>
													)}
													{reviewPull ? (
														<button
															type="button"
															onClick={() => openUrl(reviewPull.url)}
															title={`Waiting on your review: ${reviewPull.repo}#${reviewPull.number} ${reviewPull.title}`}
															className={cn(
																"flex h-6 items-center rounded-full px-2.5 font-semibold",
																PILL.attention,
															)}
														>
															Review waiting
														</button>
													) : (
														issue.role !== "assigned" && (
															<span
																className={cn(
																	"flex h-6 items-center rounded-full px-2.5",
																	ROLE_BADGE[issue.role].className,
																)}
															>
																{ROLE_BADGE[issue.role].label}
															</span>
														)
													)}
													{issue.reporter && (
														<PersonChip
															name={issue.reporter}
															className="max-w-[160px] truncate"
														/>
													)}
													{date && (
														<span
															title={issue.updated ?? undefined}
															className="px-1 text-faint-foreground"
														>
															updated {date}
														</span>
													)}
													<DueChip
														itemKey={`jira:${issue.key}`}
														title={`${issue.key}: ${issue.title}`}
														upstream={issue.dueDate}
													/>
												</div>
												{/* A mention row exists because of one comment - so it
												    shows that comment, not just the ticket it sits on. */}
												{issue.mention && (
													<div className="line-clamp-2 cursor-text select-text text-[12px] leading-relaxed text-muted-foreground">
														<span className="font-semibold text-soft-foreground">
															{issue.mention.author ?? "Someone"}
															{": "}
														</span>
														{issue.mention.text}
													</div>
												)}
											</div>
											<div className="flex shrink-0 items-center gap-1.5 pt-0.5">
												<TonightToggle itemKey={`jira:${issue.key}`} />
												<span className={ROW_PRIMARY_SLOT}>
													{activePaneId ? (
														<button
															type="button"
															onClick={() => {
																usePendingFocus.getState().focus(activePaneId);
																navigate({ to: "/home" });
															}}
															className={ROW_LIVE_BUTTON}
														>
															Go to session →
														</button>
													) : (
														<button
															type="button"
															disabled={isLaunching}
															onClick={() => void handleStart(issue)}
															className={ROW_START_BUTTON}
														>
															{launchingKey === issue.key
																? "Starting…"
																: "Start session"}
														</button>
													)}
												</span>
												<DoneButton onClick={() => markDone(doable(issue))} />
											</div>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

type IssueRow = JiraIssueRow;

interface IssueGroup {
	id: string;
	label: string;
	sprint: IssueRow["sprint"] | null;
	inProgress: boolean;
	rows: IssueRow[];
}

function daysLeft(endDate: string | null): number | null {
	if (!endDate) return null;
	return Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000);
}

/**
 * A sprint the way you'd glance at it on the board: its name, whether it's
 * running and how long it has left, and how much of yours is done-ish - a
 * thin bar, not a chart.
 */
function SprintHeading({
	label,
	sprint,
	rows,
}: {
	label: string;
	sprint: IssueRow["sprint"] | null;
	rows: IssueRow[];
}) {
	const left = daysLeft(sprint?.endDate ?? null);
	const moving = rows.filter(
		(row) => row.statusCategory.toLowerCase() === "in progress",
	).length;
	const active = sprint?.state === "active";
	return (
		<div className="sticky top-0 z-10 -mx-1 mb-2 flex items-end gap-3 bg-background/95 px-1 pt-3 pb-2 backdrop-blur">
			<div className="flex min-w-0 flex-col gap-1">
				<div className="flex items-center gap-2">
					<h2 className="truncate font-display text-[17px] font-bold tracking-[-0.01em]">
						{label}
					</h2>
					{active ? (
						<span className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary-ink">
							<span className="size-1.5 animate-pulse rounded-full bg-primary" />
							Active
						</span>
					) : sprint ? (
						<span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
							Up next
						</span>
					) : null}
				</div>
				<span className="text-[12px] text-faint-foreground">
					{[
						`${rows.length} ${rows.length === 1 ? "ticket" : "tickets"}`,
						moving > 0 && `${moving} in progress`,
						left !== null &&
							(active
								? left > 0
									? `${left} ${left === 1 ? "day" : "days"} left`
									: "ends today"
								: sprint?.startDate
									? `starts ${new Date(sprint.startDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
									: null),
						!sprint && "not in a sprint",
					]
						.filter(Boolean)
						.join(" · ")}
				</span>
			</div>
			{active && rows.length > 0 && (
				<div
					className="ml-auto mb-1.5 h-1 w-28 shrink-0 overflow-hidden rounded-full bg-secondary"
					title={`${moving} of ${rows.length} in progress`}
				>
					<div
						className="h-full rounded-full bg-working transition-[width] duration-500 ease-spyd"
						style={{ width: `${(moving / rows.length) * 100}%` }}
					/>
				</div>
			)}
		</div>
	);
}

/**
 * Where a ticket stands, at a glance and without reading: an empty ring to
 * do, a half-filled blue one in progress, a filled one in review, a green
 * check when it's done. The status's own name rides beside it as a chip.
 */
function StatusIcon({
	category,
	status,
}: {
	category: string;
	status: string;
}) {
	const c = category.toLowerCase();
	const review = /review|qa|test/i.test(status);
	const done = c === "done";
	const doing = c === "in progress";
	return (
		<span
			role="img"
			aria-label={status}
			title={status}
			className="mt-0.5 flex size-[22px] shrink-0 items-center justify-center"
		>
			{done ? (
				<svg viewBox="0 0 22 22" className="size-[22px]" aria-hidden="true">
					<circle cx="11" cy="11" r="10" className="fill-success" />
					<path
						d="M6.5 11.5l3 3 6-6.5"
						fill="none"
						stroke="white"
						strokeWidth="2.2"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			) : doing ? (
				<svg viewBox="0 0 22 22" className="size-[22px]" aria-hidden="true">
					<circle
						cx="11"
						cy="11"
						r="9"
						fill="none"
						strokeWidth="2.2"
						className="stroke-working"
					/>
					{review ? (
						<circle cx="11" cy="11" r="5.5" className="fill-working" />
					) : (
						<path d="M11 5.5a5.5 5.5 0 0 1 0 11z" className="fill-working" />
					)}
				</svg>
			) : (
				<svg viewBox="0 0 22 22" className="size-[22px]" aria-hidden="true">
					<circle
						cx="11"
						cy="11"
						r="9"
						fill="none"
						strokeWidth="2.2"
						strokeDasharray="3.4 2.6"
						className="stroke-muted-foreground"
					/>
				</svg>
			)}
		</span>
	);
}
