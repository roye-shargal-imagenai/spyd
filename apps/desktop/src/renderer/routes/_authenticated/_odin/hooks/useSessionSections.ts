import { useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { emojify } from "renderer/lib/emoji";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Pane } from "renderer/stores/tabs/types";
import { boardColumn } from "shared/board-column";
import { profileOf } from "shared/odin-profile";
import type { PaneStatus } from "shared/tabs-types";
import { untruncatedTitle } from "../components/OdinPromptDialog";
import { useOdinProfile } from "./useOdinProfile";
import { usePaneMeta } from "./usePaneMeta";

/**
 * Where a session sits on Home and in the sidebar. Where it came from wins
 * over what it's doing: the Night Agent's work and what :robot_face: started
 * from Slack each stay together until you deal with them, whatever their
 * column - a status dot says the rest.
 */
export type SessionSection =
	| "needsYou"
	| "slack"
	| "night"
	| "working"
	| "idle";

export const SECTION_ORDER: SessionSection[] = [
	"needsYou",
	"slack",
	"night",
	"working",
	"idle",
];

export const SECTION_LABEL: Record<SessionSection, string> = {
	needsYou: "Needs you",
	slack: "From Slack",
	night: "Last night",
	working: "Working",
	idle: "Idle",
};

export interface SessionEntry {
	pane: Pane;
	section: SessionSection;
	/** The board column it's in - what its status dot shows. */
	column: PaneStatus;
	title: string;
}

/** Started by the :robot_face: reaction, with nobody at the desk. */
export function isFromSlackAutoStart(pane: Pane): boolean {
	return (
		pane.odinSource === "reactions" &&
		(pane.odinTags?.includes("auto-started") ?? false)
	);
}

export function sectionOf(pane: Pane, column: PaneStatus): SessionSection {
	if (pane.odinTags?.includes("off-hours")) return "night";
	if (isFromSlackAutoStart(pane)) return "slack";
	if (column === "permission") return "needsYou";
	if (column === "working") return "working";
	return "idle";
}

/**
 * Every session the board would show for the active profile, sorted into
 * sections, oldest status change first - the one that's waited longest leads.
 * `ready` is false until the daemon poll and the profile have answered:
 * before that every session would read as dead.
 */
export function useSessionSections(): {
	entries: SessionEntry[];
	ready: boolean;
} {
	const panes = useTabsStore((s) => s.panes);
	const titleByPane = usePaneMeta((s) => s.titleByPane);
	const briefByPane = usePaneMeta((s) => s.briefByPane);
	const { activeId, isLoading: isProfileLoading } = useOdinProfile();
	// The board's poll - shared query cache, so it costs nothing extra.
	const { data: daemonSessions } =
		electronTrpc.terminal.listDaemonSessions.useQuery(undefined, {
			refetchInterval: 5_000,
		});
	const ready = daemonSessions !== undefined && !isProfileLoading;

	const entries = useMemo(() => {
		if (!ready || !daemonSessions) return [];
		const alive = new Set(
			daemonSessions.sessions
				.filter((session) => session.isAlive)
				.map((session) => session.sessionId),
		);
		const out: SessionEntry[] = [];
		for (const pane of Object.values(panes)) {
			if (pane.type !== "terminal" || pane.completed) continue;
			const rawTitle = pane.odinTaskTitle ?? titleByPane[pane.id];
			if (!rawTitle) continue;
			if (profileOf(pane.odinProfile) !== activeId) continue;
			const column = boardColumn(
				pane.status ?? "idle",
				alive.has(pane.id),
				pane.odinParked ?? false,
				false,
				pane.odinClosedIn,
			);
			const brief = pane.odinBrief ?? briefByPane[pane.id] ?? null;
			out.push({
				pane,
				column,
				section: sectionOf(pane, column),
				title: emojify(untruncatedTitle(rawTitle, brief)),
			});
		}
		return out.sort(
			(a, b) => (a.pane.odinStatusAt ?? 0) - (b.pane.odinStatusAt ?? 0),
		);
	}, [ready, daemonSessions, panes, titleByPane, briefByPane, activeId]);

	return { entries, ready };
}
