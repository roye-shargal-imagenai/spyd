import { toast } from "@odin/ui/sonner";
import { cn } from "@odin/ui/utils";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type CSSProperties, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { emojify } from "renderer/lib/emoji";
import { openUrl } from "renderer/stores/in-app-browser";
import { useNextInLinePrompt } from "renderer/stores/next-in-line-prompt";
import { typeIntoClaude } from "../board/ChatView";
import { InlineAsk } from "../components/InlineAsk";
import { useNewWorkspaceDialog } from "../components/NewWorkspaceDialog";
import { cardBody } from "../components/OdinPromptDialog";
import { BUTTON, PILL } from "../components/pill";
import { RepoArt, repoColor } from "../components/RepoArt";
import { SpiderMark, WebCorner } from "../components/SpiderMark";
import { endSession } from "../hooks/useDone";
import { usePaneMeta } from "../hooks/usePaneMeta";
import { usePendingFocus } from "../hooks/usePendingFocus";
import {
	type SessionEntry,
	type SessionSection,
	useSessionSections,
} from "../hooks/useSessionSections";

export const Route = createFileRoute("/_authenticated/_odin/home/")({
	component: HomePage,
});

/**
 * Home - the screen spyd opens on. It answers "what do I do now" for a
 * person running a handful of agents, not thirty, so each one gets a real
 * card and the page stays calm: a hero that says how the day stands, then
 * only the sections that have something in them -
 *
 *  - Needs you: a live session waiting on a permission, a question or a fix,
 *    answerable right on the card.
 *  - From Slack: what your :robot_face: reaction started, together.
 *  - Last night: what the Night Agent ran - approve, send back, or drop.
 *  - Working: what's in flight, so you can leave it alone.
 *
 * Every card wears its repo's colour (RepoArt) and arrives with a short
 * rise, one after another; the Dev Board stays the full picture.
 */

type HomeCard = SessionEntry;

const SECTIONS: {
	id: SessionSection;
	title: string;
	hint: string;
}[] = [
	{
		id: "needsYou",
		title: "Needs you",
		hint: "Waiting on an answer, a permission or a fix",
	},
	{
		id: "slack",
		title: "From Slack",
		hint: "Started by your robot reaction while you were away",
	},
	{
		id: "night",
		title: "Last night",
		hint: "What the Night Agent did - approve, revise or drop",
	},
	{ id: "working", title: "Working", hint: "In flight - nothing to do yet" },
];

function HomePage() {
	const { entries: cards, ready } = useSessionSections();
	const offHours = useNextInLinePrompt((s) => s.offHours);
	const of = (section: SessionSection) =>
		cards.filter((c) => c.section === section);
	// Everything waiting on you, wherever it came from - the same count the
	// sidebar shows, so the two never disagree.
	const needsYou = cards.filter((c) => c.column === "permission").length;
	const working = cards.filter((c) => c.column === "working").length;
	const shown = SECTIONS.filter((section) => of(section.id).length > 0);
	// One running index across sections, so the stagger reads top to bottom.
	let index = 0;

	const sentence = !ready
		? "Looking at your sessions…"
		: needsYou > 0
			? `${needsYou} ${needsYou === 1 ? "session is" : "sessions are"} waiting on you.`
			: working > 0
				? `Nothing needs you. ${working} ${working === 1 ? "agent is" : "agents are"} working.`
				: cards.length > 0
					? "All quiet. Nothing needs you right now."
					: "All quiet. Start a workspace and put an agent on something.";

	return (
		<div className="relative h-full overflow-y-auto">
			{/* The hero's light: the accent, washing down into the page. */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-x-0 top-0 h-[340px] bg-[radial-gradient(900px_300px_at_20%_-40px,color-mix(in_oklab,var(--primary)_38%,transparent),transparent_70%),radial-gradient(700px_260px_at_85%_-60px,color-mix(in_oklab,var(--working)_18%,transparent),transparent_70%)]"
			/>
			<WebCorner className="pointer-events-none absolute top-0 right-0 size-[300px] text-foreground opacity-[0.06]" />

			<div className="relative mx-auto flex max-w-[1180px] flex-col gap-12 px-10 pb-16 pt-12">
				<header className="rise flex flex-wrap items-end justify-between gap-8">
					<div className="min-w-0">
						<div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
							{today()}
						</div>
						<h1 className="mt-2 font-display text-[44px] font-bold leading-[1.05] tracking-[-0.02em] text-foreground">
							{greeting()}
						</h1>
						<p className="mt-3 text-[16px] text-soft-foreground">{sentence}</p>
					</div>
					<div className="flex gap-3">
						<StatTile
							label="Needs you"
							value={needsYou}
							tone={needsYou > 0 ? "bg-primary text-primary-foreground" : ""}
							target="needsYou"
						/>
						<StatTile label="Working" value={working} target="working" />
						<StatTile
							label="Night Agent"
							value={offHours.enabled ? offHours.start : "Off"}
							target="night"
						/>
					</div>
				</header>

				{ready && shown.length === 0 && <EmptyHome />}

				{shown.map((section) => (
					<section
						key={section.id}
						id={`home-${section.id}`}
						className="flex scroll-mt-6 flex-col gap-4"
					>
						<div
							className="rise flex items-baseline gap-3"
							style={{ "--i": index++ } as CSSProperties}
						>
							<h2 className="font-display text-[22px] font-bold tracking-[-0.01em]">
								{section.title}
							</h2>
							<span className="text-[13px] text-muted-foreground">
								{section.hint}
							</span>
						</div>
						<div className="grid grid-cols-[repeat(auto-fill,minmax(330px,1fr))] gap-5">
							{of(section.id).map((card) => (
								<SessionCard key={card.pane.id} card={card} index={index++} />
							))}
						</div>
					</section>
				))}
			</div>
		</div>
	);
}

function today(): string {
	return new Date().toLocaleDateString(undefined, {
		weekday: "long",
		day: "numeric",
		month: "long",
	});
}

function greeting(): string {
	const hour = new Date().getHours();
	return hour < 5
		? "Up late"
		: hour < 12
			? "Good morning"
			: hour < 18
				? "Good afternoon"
				: "Good evening";
}

/** A number at a glance; a click takes you to its section. */
function StatTile({
	label,
	value,
	tone,
	target,
}: {
	label: string;
	value: number | string;
	tone?: string;
	target: SessionSection;
}) {
	return (
		<button
			type="button"
			onClick={() =>
				document
					.getElementById(`home-${target}`)
					?.scrollIntoView({ behavior: "smooth", block: "start" })
			}
			className={cn(
				"lift flex min-w-[112px] flex-col items-start rounded-[10px] bg-card/80 px-4 py-3 text-left backdrop-blur",
				tone,
			)}
		>
			<span className="font-display text-[26px] font-bold leading-none tabular-nums">
				{value}
			</span>
			<span className="mt-1.5 text-[12px] font-medium opacity-80">{label}</span>
		</button>
	);
}

/** Nothing to show: say so warmly, and offer the next move. */
function EmptyHome() {
	const navigate = useNavigate();
	return (
		<div className="rise flex flex-col items-center gap-4 rounded-[14px] bg-card/60 px-8 py-16 text-center">
			<SpiderMark className="size-14 text-soft-foreground" />
			<div>
				<div className="font-display text-[20px] font-bold">All quiet</div>
				<p className="mt-1 text-[14px] text-muted-foreground">
					No agents are running. Start a workspace in one of your repos.
				</p>
			</div>
			<div className="flex gap-2">
				<button
					type="button"
					onClick={() => useNewWorkspaceDialog.getState().open()}
					className={cn(
						"rounded-[6px] px-4 py-2 text-[13px] font-semibold",
						BUTTON.primary,
					)}
				>
					New workspace <span className="ml-1 opacity-70">⌘N</span>
				</button>
				<button
					type="button"
					onClick={() => navigate({ to: "/all" })}
					className={cn(
						"rounded-[6px] px-4 py-2 text-[13px] font-semibold",
						BUTTON.secondary,
					)}
				>
					See your tasks
				</button>
			</div>
		</div>
	);
}

/** What a card's status line says, by the board column it's in. */
const STATUS: Record<string, { label: string; pill: string }> = {
	working: { label: "Working", pill: PILL.working },
	permission: { label: "Needs you", pill: PILL.attention },
	review: { label: "Finished", pill: PILL.success },
	idle: { label: "Stopped", pill: PILL.neutral },
};

function SessionCard({ card, index }: { card: HomeCard; index: number }) {
	const navigate = useNavigate();
	const { pane } = card;
	const briefByPane = usePaneMeta((s) => s.briefByPane);
	const sessionIdByPane = usePaneMeta((s) => s.sessionIdByPane);
	const brief = pane.odinBrief ?? briefByPane[pane.id] ?? null;
	const { title } = card;
	const body = cardBody(title, brief);
	const sessionId = pane.claudeSessionId ?? sessionIdByPane[pane.id] ?? null;
	const { data: work } = electronTrpc.repos.workingRepoName.useQuery(
		{ claudeSessionId: sessionId ?? "" },
		{ enabled: !!sessionId, retry: false, staleTime: 60_000 },
	);
	const status = STATUS[card.column] ?? STATUS.idle;
	const repo =
		work?.name ??
		(pane.odinCwd ?? pane.initialCwd ?? "").split("/").filter(Boolean).pop() ??
		"session";
	// Last night's and Slack's runs were started without you: both get a verdict.
	const isNight = card.section === "night" || card.section === "slack";
	const isLive = card.column === "working" || card.column === "permission";
	const write = electronTrpc.terminal.write.useMutation();
	const [revising, setRevising] = useState(false);
	const [note, setNote] = useState("");

	const open = () => {
		usePendingFocus.getState().focus(pane.id);
		navigate({ to: "/board" });
	};
	const finish = (verb: string) => {
		endSession(pane.id);
		toast.success(`${verb} - ${title.slice(0, 50)}`);
	};
	const sendBack = async () => {
		const text = note.trim();
		if (!text) return;
		try {
			await typeIntoClaude(write.mutateAsync, pane.id, text);
		} catch {
			// The PTY is gone (closed for idling, or the app restarted): the
			// board's Resume brings the conversation back first.
			toast.error("That session has ended - Open it and resume first");
			return;
		}
		setNote("");
		setRevising(false);
		toast.success("Sent back to the session");
	};

	return (
		<article
			className="rise lift group flex min-h-[200px] flex-col overflow-hidden rounded-[12px] bg-card hover:bg-popover"
			style={{ "--i": index } as CSSProperties}
		>
			{/* The cover: the repo's colour, its art, and where the session stands. */}
			<div
				className="flex items-center gap-2.5 px-5 pt-4 pb-3"
				style={{
					background: `linear-gradient(180deg, color-mix(in oklab, ${repoColor(repo)} 30%, transparent), transparent)`,
				}}
			>
				<RepoArt name={repo} size={28} />
				<span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-soft-foreground">
					{repo}
				</span>
				<span
					className={cn(
						"shrink-0 rounded-full px-2.5 py-[3px] text-[11px] font-semibold",
						status.pill,
					)}
				>
					{status.label}
				</span>
			</div>
			<div className="flex flex-1 flex-col gap-3 px-5 pt-1 pb-5">
				<h3 className="line-clamp-2 font-display text-[17px] font-semibold leading-snug tracking-[-0.005em]">
					{title}
				</h3>
				{body && (
					<p className="line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">
						{emojify(body)}
					</p>
				)}

				{(work?.pullRequests ?? []).length > 0 && (
					<div className="flex flex-wrap gap-1.5">
						{work?.pullRequests.map((pr) => (
							<button
								key={pr.url}
								type="button"
								onClick={() => openUrl(pr.url)}
								className={cn(
									"rounded-full px-2 py-[2px] text-[11px] font-semibold",
									PILL.brand,
								)}
							>
								PR #{pr.number} ↗
							</button>
						))}
					</div>
				)}

				{card.column === "permission" && sessionId && !revising && (
					<InlineAsk paneId={pane.id} sessionId={sessionId} />
				)}

				{revising && (
					<textarea
						// biome-ignore lint/a11y/noAutofocus: opened by a click on Revise
						autoFocus
						value={note}
						onChange={(e) => setNote(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
								void sendBack();
							if (e.key === "Escape") setRevising(false);
						}}
						placeholder="What should it change? (⌘↵ to send)"
						className="min-h-[72px] resize-none rounded-[6px] border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
					/>
				)}

				<div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
					<button
						type="button"
						onClick={open}
						className={cn(
							"rounded-lg px-3 py-1.5 text-[12px] font-semibold",
							isNight ? BUTTON.secondary : BUTTON.primary,
						)}
					>
						Open
					</button>
					{isNight && !revising && (
						<>
							<button
								type="button"
								title="It's good - take it off Home. Session History keeps it."
								onClick={() => finish("Approved")}
								className={cn(
									"rounded-lg px-3 py-1.5 text-[12px] font-semibold",
									BUTTON.done,
								)}
							>
								Approve
							</button>
							{isLive || card.column === "review" ? (
								<button
									type="button"
									title="Tell the session what to change"
									onClick={() => setRevising(true)}
									className={cn(
										"rounded-lg px-3 py-1.5 text-[12px] font-semibold",
										BUTTON.secondary,
									)}
								>
									Revise
								</button>
							) : null}
							<button
								type="button"
								title="Not wanted - end the session"
								onClick={() => finish("Dropped")}
								className="ml-auto rounded-lg px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
							>
								Drop
							</button>
						</>
					)}
					{revising && (
						<>
							<button
								type="button"
								disabled={!note.trim()}
								onClick={() => void sendBack()}
								className={cn(
									"rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50",
									BUTTON.primary,
								)}
							>
								Send
							</button>
							<button
								type="button"
								onClick={() => setRevising(false)}
								className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
							>
								Cancel
							</button>
						</>
					)}
				</div>
			</div>
		</article>
	);
}
