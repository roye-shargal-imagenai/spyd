import { toast } from "@odin/ui/sonner";
import { cn } from "@odin/ui/utils";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { emojify } from "renderer/lib/emoji";
import { openUrl } from "renderer/stores/in-app-browser";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Pane } from "renderer/stores/tabs/types";
import { boardColumn } from "shared/board-column";
import { profileOf } from "shared/odin-profile";
import { typeIntoClaude } from "../board/ChatView";
import { cardBody, untruncatedTitle } from "../components/OdinPromptDialog";
import { BUTTON, PILL } from "../components/pill";
import { endSession } from "../hooks/useDone";
import { useOdinProfile } from "../hooks/useOdinProfile";
import { usePaneMeta } from "../hooks/usePaneMeta";
import { usePendingFocus } from "../hooks/usePendingFocus";

export const Route = createFileRoute("/_authenticated/_odin/home/")({
	component: HomePage,
});

/**
 * Home - the screen Odin opens on. It answers "what do I do now" with a
 * handful of big cards instead of columns of rows: a person runs a few
 * sessions at a time, not thirty, so every one of them gets room to say what
 * it is. Three sections, each only when it has something in it:
 *
 *  - Needs you: a live session waiting on a permission, a question or a fix.
 *  - Last night: what the Night Agent ran, to approve, send back or drop -
 *    the morning triage. It stays here until you decide, whatever its column.
 *  - Working: what's in flight, so you can leave it alone.
 *
 * The Dev Board stays the full picture, one click away; every card's Open
 * lands on its session there.
 */

type Section = "needsYou" | "night" | "working";

interface HomeCard {
	pane: Pane;
	section: Section;
	column: ReturnType<typeof boardColumn>;
}

function HomePage() {
	const panes = useTabsStore((s) => s.panes);
	const titleByPane = usePaneMeta((s) => s.titleByPane);
	const { activeId, isLoading: isProfileLoading } = useOdinProfile();
	// The board's poll - shared query cache, so it costs nothing extra. A dead
	// session can't be working or waiting on you, whatever its status froze at.
	const { data: daemonSessions } =
		electronTrpc.terminal.listDaemonSessions.useQuery(undefined, {
			refetchInterval: 5_000,
		});

	const cards = useMemo(() => {
		if (daemonSessions === undefined || isProfileLoading) return [];
		const alive = new Set(
			daemonSessions.sessions
				.filter((session) => session.isAlive)
				.map((session) => session.sessionId),
		);
		const out: HomeCard[] = [];
		for (const pane of Object.values(panes)) {
			if (pane.type !== "terminal" || pane.completed) continue;
			if (!pane.odinTaskTitle && !titleByPane[pane.id]) continue;
			if (profileOf(pane.odinProfile) !== activeId) continue;
			const column = boardColumn(
				pane.status ?? "idle",
				alive.has(pane.id),
				pane.odinParked ?? false,
				false,
				pane.odinClosedIn,
			);
			// The overnight run's work waits for your verdict even once it's
			// finished or its PTY is gone - that is the whole point of triage.
			if (pane.odinTags?.includes("off-hours"))
				out.push({ pane, section: "night", column });
			else if (column === "permission")
				out.push({ pane, section: "needsYou", column });
			else if (column === "working")
				out.push({ pane, section: "working", column });
		}
		// Oldest first inside a section: the one that's waited longest goes first.
		return out.sort(
			(a, b) => (a.pane.odinStatusAt ?? 0) - (b.pane.odinStatusAt ?? 0),
		);
	}, [panes, titleByPane, daemonSessions, activeId, isProfileLoading]);

	const of = (section: Section) => cards.filter((c) => c.section === section);
	const needsYou = of("needsYou");
	const night = of("night");
	const working = of("working");

	const summary = [
		needsYou.length > 0 && `${needsYou.length} need you`,
		night.length > 0 && `${night.length} from last night`,
		working.length > 0 && `${working.length} working`,
	].filter(Boolean);

	return (
		<div className="h-full overflow-y-auto">
			<div className="mx-auto flex max-w-[1100px] flex-col gap-9 px-8 pb-12 pt-8">
				<header>
					<div className="text-[11px] font-semibold uppercase tracking-wide text-faint-foreground">
						Today in Odin
					</div>
					<h1 className="mt-1 text-[22px] font-semibold">{greeting()}</h1>
					<p className="mt-1 text-[14px] text-muted-foreground">
						{summary.length > 0
							? `${summary.join(" · ")}.`
							: daemonSessions === undefined
								? "Looking at your sessions…"
								: "Nothing is waiting on you. Start something from the Dev Board or Tasks."}
					</p>
				</header>

				<HomeSection
					title="Needs you"
					hint="Waiting on an answer, a permission or a fix."
					cards={needsYou}
				/>
				<HomeSection
					title="Last night"
					hint="What the Night Agent did. Approve it, send it back, or drop it."
					cards={night}
				/>
				<HomeSection
					title="Working"
					hint="In flight - nothing to do yet."
					cards={working}
				/>
			</div>
		</div>
	);
}

function greeting(): string {
	const hour = new Date().getHours();
	return hour < 12
		? "Good morning"
		: hour < 18
			? "Good afternoon"
			: "Good evening";
}

function HomeSection({
	title,
	hint,
	cards,
}: {
	title: string;
	hint: string;
	cards: HomeCard[];
}) {
	if (cards.length === 0) return null;
	return (
		<section className="flex flex-col gap-3">
			<div className="flex items-baseline gap-3">
				<h2 className="text-[15px] font-semibold">{title}</h2>
				<span className="text-[12px] text-faint-foreground">{hint}</span>
			</div>
			<div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
				{cards.map((card) => (
					<SessionCard key={card.pane.id} card={card} />
				))}
			</div>
		</section>
	);
}

/** What a card's status line says, by the board column it's in. */
const STATUS: Record<string, { label: string; pill: string }> = {
	working: { label: "Working", pill: PILL.working },
	permission: { label: "Needs you", pill: PILL.attention },
	review: { label: "Finished", pill: PILL.success },
	idle: { label: "Stopped", pill: PILL.neutral },
};

function SessionCard({ card }: { card: HomeCard }) {
	const navigate = useNavigate();
	const { pane } = card;
	const titleByPane = usePaneMeta((s) => s.titleByPane);
	const briefByPane = usePaneMeta((s) => s.briefByPane);
	const sessionIdByPane = usePaneMeta((s) => s.sessionIdByPane);
	const brief = pane.odinBrief ?? briefByPane[pane.id] ?? null;
	const title = emojify(
		untruncatedTitle(
			pane.odinTaskTitle ?? titleByPane[pane.id] ?? pane.name ?? "Session",
			brief,
		),
	);
	const body = cardBody(title, brief);
	const sessionId = pane.claudeSessionId ?? sessionIdByPane[pane.id] ?? null;
	const { data: work } = electronTrpc.repos.workingRepoName.useQuery(
		{ claudeSessionId: sessionId ?? "" },
		{ enabled: !!sessionId, retry: false, staleTime: 60_000 },
	);
	const status = STATUS[card.column] ?? STATUS.idle;
	const isNight = card.section === "night";
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
		<article className="flex min-h-[170px] flex-col gap-3 rounded-[14px] border border-border bg-card p-5 shadow-[0_1px_0_rgb(255_255_255/0.03)_inset]">
			<div className="flex items-center gap-2">
				<span
					className={cn(
						"rounded-full px-2 py-[2px] text-[11px] font-semibold",
						status.pill,
					)}
				>
					{status.label}
				</span>
				{work?.name && (
					<span className="truncate text-[12px] text-faint-foreground">
						{work.name}
					</span>
				)}
			</div>

			<h3 className="line-clamp-2 text-[15px] font-semibold leading-snug">
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

			{revising && (
				<textarea
					// biome-ignore lint/a11y/noAutofocus: opened by a click on Revise
					autoFocus
					value={note}
					onChange={(e) => setNote(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void sendBack();
						if (e.key === "Escape") setRevising(false);
					}}
					placeholder="What should it change? (⌘↵ to send)"
					className="min-h-[72px] resize-none rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
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
		</article>
	);
}
