import { cn } from "@odin/ui/utils";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { IconType } from "react-icons";
import { HiMoon, HiOutlineMoon, HiOutlineXMark } from "react-icons/hi2";
import {
	inOffHours,
	useNextInLinePrompt,
} from "renderer/stores/next-in-line-prompt";
import type { AllItem } from "../all/all-items";
import { useNextInLineQueue } from "../board/NextInLine";
import { FullTitle } from "../components/FullTitle";
import { FEED_TABS, type FeedPath } from "../components/feed-counts";
import { StatusGlyph, useSidebarSessions } from "../components/SessionList";
import { useOpenInHome } from "../components/SessionPane";
import { useOdinFeeds } from "../hooks/useOdinFeeds";
import { useOdinTasks } from "../hooks/useOdinTasks";

export const Route = createFileRoute("/_authenticated/_odin/night/")({
	component: NightPage,
});

/**
 * The Night Agent, in one place: whether it's on and when it starts, the
 * exact list it will work through tonight in the order it will take them,
 * and what it did last night. Marking something for tonight happens on the
 * rows themselves (the moon); this is where you see the plan and change it.
 */

const SOURCE_ICON = Object.fromEntries(
	FEED_TABS.map(({ to, Icon }) => [to, Icon]),
) as Record<FeedPath, IconType>;

function minutesOf(hhmm: string): number {
	const [h = 0, m = 0] = hhmm.split(":").map(Number);
	return h * 60 + m;
}

/** "in 5h 12m" until the window opens, measured from `now`. */
function untilStart(now: Date, start: string): string {
	const t = now.getHours() * 60 + now.getMinutes();
	let wait = minutesOf(start) - t;
	if (wait <= 0) wait += 24 * 60;
	const h = Math.floor(wait / 60);
	const m = wait % 60;
	return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}

type Reason = "asked" | "due" | "pick" | "suggest";

function NightPage() {
	const navigate = useNavigate();
	const offHours = useNextInLinePrompt((s) => s.offHours);
	const setOffHours = useNextInLinePrompt((s) => s.setOffHours);
	const started = useNextInLinePrompt((s) => s.offHoursStarted);
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 30_000);
		return () => clearInterval(timer);
	}, []);
	const running =
		offHours.enabled && inOffHours(now, offHours.start, offHours.end);

	// The same queue and the same order the runner uses.
	const { pinned, unpinned, isAiHidden, duplicateFor } =
		useNextInLineQueue(true);
	const { reactions } = useOdinFeeds();
	const marks = useOdinTasks((s) => s.tonight ?? []);
	const setTonight = useOdinTasks((s) => s.setTonight);

	const plan = useMemo(() => {
		const asked = new Set([
			...marks,
			...(reactions.data?.rows ?? [])
				.filter((row) => row.night)
				.map((row) => `slack:${row.id}`),
		]);
		const all = [...pinned, ...unpinned];
		const seen = new Set<string>();
		const rows: { item: AllItem; reason: Reason }[] = [];
		const add = (item: AllItem, reason: Reason) => {
			if (seen.has(item.key) || duplicateFor(item)) return;
			seen.add(item.key);
			rows.push({ item, reason });
		};
		for (const item of all) if (asked.has(item.key)) add(item, "asked");
		if (offHours.onlyMarked === false) {
			for (const item of pinned) if (!isAiHidden(item)) add(item, "due");
			for (const item of unpinned) if (!isAiHidden(item)) add(item, "pick");
		} else {
			// Not part of tonight, but worth a glance: what's due soon.
			for (const item of pinned) if (!isAiHidden(item)) add(item, "suggest");
		}
		return rows;
	}, [
		marks,
		reactions.data,
		pinned,
		unpinned,
		isAiHidden,
		duplicateFor,
		offHours.onlyMarked,
	]);

	const room = Math.max(offHours.maxSessions - (running ? started : 0), 0);
	const runs = plan.filter((row) => row.reason !== "suggest");
	const tonight = runs.slice(0, room);
	const later = [
		...runs.slice(room),
		...plan.filter((row) => row.reason === "suggest"),
	].slice(0, 6);
	const onlyMarked = offHours.onlyMarked !== false;

	const { sessions } = useSidebarSessions();
	const lastNight = sessions.filter((entry) => entry.section === "night");
	const openInHome = useOpenInHome();

	return (
		<div className="h-full overflow-y-auto">
			<div className="mx-auto flex max-w-[880px] flex-col gap-7 px-8 pt-8 pb-16">
				{/* Where it stands, in one sentence, and the switch. */}
				<header className="flex items-start gap-5">
					<span
						className={cn(
							"flex size-14 shrink-0 items-center justify-center rounded-lg",
							offHours.enabled ? "bg-primary/15" : "bg-secondary",
						)}
					>
						<HiMoon
							className={cn(
								"size-7",
								offHours.enabled ? "text-primary-ink" : "text-muted-foreground",
							)}
						/>
					</span>
					<div className="flex min-w-0 flex-1 flex-col gap-1">
						<h1 className="font-display text-[24px] font-semibold leading-tight tracking-[-0.02em]">
							Night Agent
						</h1>
						<p className="text-[14px] text-muted-foreground">
							{!offHours.enabled
								? "Off. Turn it on and it works through the list below while you sleep."
								: running
									? `Working now, until ${offHours.end} - ${started} of ${offHours.maxSessions} started tonight.`
									: `Starts ${untilStart(now, offHours.start)} (${offHours.start} - ${offHours.end}), up to ${offHours.maxSessions} sessions.`}
						</p>
					</div>
					<div className="flex shrink-0 items-center gap-2 pt-1">
						<button
							type="button"
							onClick={() => navigate({ to: "/settings/backlog" })}
							className="h-9 rounded-md px-4 text-[13px] text-muted-foreground hover:bg-accent/60 hover:text-foreground"
						>
							Settings
						</button>
						<button
							type="button"
							role="switch"
							aria-checked={offHours.enabled}
							aria-label="Night Agent on"
							onClick={() => setOffHours({ enabled: !offHours.enabled })}
							className={cn(
								"relative h-9 w-16 rounded-full transition-colors duration-300 ease-spyd",
								offHours.enabled ? "bg-primary" : "bg-input",
							)}
						>
							<span
								className={cn(
									"absolute top-1 left-1 size-7 rounded-full bg-white shadow transition-transform duration-300 ease-spyd",
									offHours.enabled && "translate-x-7",
								)}
							/>
						</button>
					</div>
				</header>

				{/* Tonight's plan, in the order it will take them. */}
				<section className="flex flex-col gap-3">
					<div className="flex items-baseline justify-between">
						<h2 className="font-display text-[16px] font-semibold tracking-[-0.01em]">
							Tonight's plan
						</h2>
						<button
							type="button"
							role="switch"
							aria-checked={onlyMarked}
							onClick={() => setOffHours({ onlyMarked: !onlyMarked })}
							title={
								onlyMarked
									? "It works only on what you marked. Click to let it add its own picks."
									: "It adds its own picks after yours. Click to keep it to what you marked."
							}
							className="flex items-center gap-2 rounded-full py-1 pr-1 pl-3 text-[12.5px] text-muted-foreground hover:bg-accent/60"
						>
							Only what I mark
							<span
								className={cn(
									"relative h-5 w-9 rounded-full transition-colors duration-300 ease-spyd",
									onlyMarked ? "bg-primary" : "bg-input",
								)}
							>
								<span
									className={cn(
										"absolute top-0.5 left-0.5 size-4 rounded-full bg-white transition-transform duration-300 ease-spyd",
										onlyMarked && "translate-x-4",
									)}
								/>
							</span>
						</button>
					</div>
					{tonight.length === 0 ? (
						<div className="rounded-lg bg-card px-6 py-10 text-center ring-1 ring-inset ring-border">
							<HiOutlineMoon className="mx-auto mb-3 size-7 text-faint-foreground" />
							<p className="text-[14px] font-semibold">
								{onlyMarked
									? "Nothing marked for tonight"
									: "Nothing planned yet"}
							</p>
							<p className="mt-1 text-[13px] text-muted-foreground">
								Hover any row in Tasks or Jira and click the moon, type #tonight
								in a task, or press ⌥↵ in a new workspace.
							</p>
						</div>
					) : (
						<ol className="flex flex-col gap-2">
							{tonight.map(({ item, reason }, i) => (
								<PlanRow
									key={item.key}
									index={i + 1}
									item={item}
									reason={reason}
									onUnmark={
										marks.includes(item.key)
											? () => setTonight(item.key, false)
											: undefined
									}
									onMark={
										reason !== "asked"
											? () => setTonight(item.key, true)
											: undefined
									}
								/>
							))}
						</ol>
					)}
					{later.length > 0 && (
						<details className="group/later rounded-lg px-1">
							<summary className="cursor-pointer list-none py-1 text-[12.5px] text-faint-foreground hover:text-muted-foreground">
								{onlyMarked
									? `Not marked, so it won't touch them: ${later.length} due soon`
									: `After those, if the night allows: ${later.length} more`}
							</summary>
							<ol className="mt-2 flex flex-col gap-2 opacity-70">
								{later.map(({ item, reason }, i) => (
									<PlanRow
										key={item.key}
										index={tonight.length + i + 1}
										item={item}
										reason={reason}
										onMark={() => setTonight(item.key, true)}
									/>
								))}
							</ol>
						</details>
					)}
				</section>

				{/* What it already did. */}
				<section className="flex flex-col gap-3">
					<h2 className="font-display text-[16px] font-semibold tracking-[-0.01em]">
						From the Night Agent
					</h2>
					{lastNight.length === 0 ? (
						<p className="text-[13px] text-muted-foreground">
							Nothing yet - what it starts tonight shows up here in the morning.
						</p>
					) : (
						<div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2.5">
							{lastNight.map((entry) => (
								<button
									key={entry.pane.id}
									type="button"
									onClick={() => openInHome(entry.pane.id)}
									className="lift flex flex-col gap-2 rounded-lg bg-card p-4 text-left ring-1 ring-inset ring-border"
								>
									<span className="flex items-center gap-2 text-[12px] text-muted-foreground">
										<StatusGlyph column={entry.column} />
										{entry.column === "permission"
											? "Needs you"
											: entry.column === "working"
												? "Still working"
												: "Finished"}
									</span>
									<span className="line-clamp-2 text-[14px] font-semibold leading-snug">
										{entry.title}
									</span>
								</button>
							))}
						</div>
					)}
				</section>
			</div>
		</div>
	);
}

const REASON: Record<Reason, { label: string; className: string }> = {
	asked: {
		label: "You marked it",
		className: "bg-primary/15 text-primary-ink",
	},
	due: { label: "Due soon", className: "bg-attention/15 text-attention-ink" },
	pick: { label: "Its pick", className: "bg-secondary text-muted-foreground" },
	suggest: {
		label: "Due soon - not marked",
		className: "bg-secondary text-muted-foreground",
	},
};

function PlanRow({
	index,
	item,
	reason,
	onUnmark,
	onMark,
}: {
	index: number;
	item: AllItem;
	reason: Reason;
	onUnmark?: () => void;
	onMark?: () => void;
}) {
	const Icon = SOURCE_ICON[item.to];
	return (
		<li className="group flex items-center gap-3.5 rounded-lg bg-card px-4 py-3 ring-1 ring-inset ring-border">
			<span
				className={cn(
					"flex size-7 shrink-0 items-center justify-center rounded-full font-display text-[13px] font-semibold tabular-nums",
					reason === "asked"
						? "bg-primary text-primary-foreground"
						: "bg-secondary text-soft-foreground",
				)}
			>
				{index}
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<FullTitle text={item.title} detail={item.context}>
					<span className="line-clamp-2 text-[14px] font-semibold leading-snug [overflow-wrap:anywhere]">
						{item.title}
					</span>
				</FullTitle>
				<span className="flex flex-wrap items-center gap-1.5 text-[12px]">
					<span className="flex h-6 items-center gap-1.5 rounded-md bg-secondary px-2.5 font-semibold text-soft-foreground">
						{Icon && <Icon className="size-3.5" aria-hidden />}
						{item.source}
					</span>
					<span
						className={cn(
							"flex h-6 items-center rounded-md px-2.5 font-semibold",
							REASON[reason].className,
						)}
					>
						{REASON[reason].label}
					</span>
					{item.context && (
						<span className="px-1 text-muted-foreground">{item.context}</span>
					)}
				</span>
			</div>
			{onUnmark && (
				<button
					type="button"
					onClick={onUnmark}
					title="Take it off tonight's plan"
					className="flex h-8 items-center gap-1 rounded-md px-3 text-[12px] text-muted-foreground opacity-0 transition-opacity hover:bg-accent/60 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
				>
					<HiOutlineXMark className="size-3.5" />
					Not tonight
				</button>
			)}
			{onMark && (
				<button
					type="button"
					onClick={onMark}
					title="Put it first tonight"
					className="flex h-8 items-center gap-1 rounded-md px-3 text-[12px] text-muted-foreground opacity-0 transition-opacity hover:bg-accent/60 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
				>
					<HiOutlineMoon className="size-3.5" />
					Do first
				</button>
			)}
		</li>
	);
}
