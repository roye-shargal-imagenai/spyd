import { cn } from "@odin/ui/utils";
import { useMatchRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { HiOutlineXMark } from "react-icons/hi2";
import { create } from "zustand";
import { useSidebarSessions } from "./SessionList";
import { useHomeSelection, useOpenInHome } from "./SessionPane";
import { SpiderMark } from "./SpiderMark";

/**
 * Moments: the second an agent finishes or starts waiting on you, a card
 * drops in on a silk thread at the bottom right - who it is, what happened,
 * and Open. It stays a few seconds and goes; hovering holds it. Not for the
 * session you're already looking at, and never more than three at once.
 * (The system banner and its ping still come from the main process.)
 */

type Kind = "done" | "needs";

interface Moment {
	id: string;
	paneId: string;
	title: string;
	kind: Kind;
}

const HOLD_MS = 7000;

/** The cards on screen, newest last. A store so anything can raise one. */
export const useMoments = create<{
	moments: Moment[];
	push: (fresh: Omit<Moment, "id">[]) => void;
	dismiss: (id: string) => void;
}>((set) => ({
	moments: [],
	push: (fresh) =>
		set((s) => ({
			moments: [
				...s.moments.filter((m) => !fresh.some((f) => f.paneId === m.paneId)),
				...fresh.map((f) => ({ ...f, id: `${f.paneId}:${Date.now()}` })),
			].slice(-3),
		})),
	dismiss: (id) =>
		set((s) => ({ moments: s.moments.filter((m) => m.id !== id) })),
}));

export function Moments() {
	const { sessions, ready } = useSidebarSessions();
	const openInHome = useOpenInHome();
	const onHome = !!useMatchRoute()({ to: "/home", fuzzy: true });
	const selected = useHomeSelection((s) => s.paneId);
	const moments = useMoments((s) => s.moments);
	const { push, dismiss } = useMoments.getState();
	const last = useRef<Map<string, string> | null>(null);

	useEffect(() => {
		if (!ready) return;
		const now = new Map(sessions.map((s) => [s.pane.id, s.column]));
		const before = last.current;
		last.current = now;
		// The first look is the starting point, not a wave of news.
		if (!before) return;
		const fresh: Omit<Moment, "id">[] = [];
		for (const entry of sessions) {
			const was = before.get(entry.pane.id);
			if (!was || was === entry.column) continue;
			const kind: Kind | null =
				entry.column === "review"
					? "done"
					: entry.column === "permission"
						? "needs"
						: null;
			if (!kind) continue;
			// You're looking right at it.
			if (onHome && selected === entry.pane.id && document.hasFocus()) continue;
			fresh.push({
				paneId: entry.pane.id,
				title: entry.title,
				kind,
			});
		}
		if (fresh.length) push(fresh);
	}, [sessions, ready, onHome, selected, push]);

	return (
		<div className="pointer-events-none fixed right-5 bottom-5 z-50 flex w-[340px] flex-col gap-2.5">
			{moments.map((moment) => (
				<MomentCard
					key={moment.id}
					moment={moment}
					onOpen={() => {
						openInHome(moment.paneId);
						dismiss(moment.id);
					}}
					onDismiss={() => dismiss(moment.id)}
				/>
			))}
		</div>
	);
}

function MomentCard({
	moment,
	onOpen,
	onDismiss,
}: {
	moment: Moment;
	onOpen: () => void;
	onDismiss: () => void;
}) {
	const [held, setHeld] = useState(false);
	useEffect(() => {
		if (held) return;
		const timer = setTimeout(onDismiss, HOLD_MS);
		return () => clearTimeout(timer);
	}, [held, onDismiss]);
	const needs = moment.kind === "needs";
	return (
		<output
			onMouseEnter={() => setHeld(true)}
			onMouseLeave={() => setHeld(false)}
			className="moment-drop pointer-events-auto relative block"
		>
			{/* The silk it hangs from. */}
			<span
				aria-hidden="true"
				className="moment-silk absolute -top-5 left-8 h-5 w-px bg-gradient-to-b from-transparent to-soft-foreground/60"
			/>
			<div
				className={cn(
					"flex items-start gap-3 rounded-lg bg-card/95 p-3.5 pr-3 shadow-[0_20px_50px_-18px_rgba(0,0,0,0.75)] ring-1 ring-inset backdrop-blur",
					needs ? "ring-attention/45" : "ring-input",
				)}
			>
				<span
					className={cn(
						"flex size-9 shrink-0 items-center justify-center rounded-full",
						needs ? "bg-attention/15" : "bg-success/12",
					)}
				>
					<SpiderMark className={cn("size-5", needs ? "moment-wiggle" : "")} />
				</span>
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span
						className={cn(
							"text-[11.5px] font-semibold",
							needs ? "text-attention-ink" : "text-success-ink",
						)}
					>
						{needs ? "Needs you" : "Finished"}
					</span>
					<span className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-foreground">
						{moment.title}
					</span>
					<div className="mt-2 flex gap-1.5">
						<button
							type="button"
							onClick={onOpen}
							className={cn(
								"h-7 rounded-md px-3.5 text-[12px] font-semibold",
								needs
									? "bg-primary text-primary-foreground hover:brightness-110"
									: "bg-secondary text-foreground hover:bg-input",
							)}
						>
							{needs ? "Answer" : "Open"}
						</button>
					</div>
				</div>
				<button
					type="button"
					aria-label="Dismiss"
					onClick={onDismiss}
					className="rounded-full p-1 text-faint-foreground hover:bg-accent/60 hover:text-foreground"
				>
					<HiOutlineXMark className="size-3.5" />
				</button>
			</div>
		</output>
	);
}
