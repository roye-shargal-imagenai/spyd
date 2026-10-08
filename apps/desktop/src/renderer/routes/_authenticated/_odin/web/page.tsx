import { cn } from "@odin/ui/utils";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { describeTool } from "../components/InlineAsk";
import { BUTTON } from "../components/pill";
import { PAST, usePastWeek } from "../components/RecentSessions";
import { useSidebarSessions } from "../components/SessionList";
import { useHomeSelection, useOpenInHome } from "../components/SessionPane";
import { SpiderMark } from "../components/SpiderMark";
import { usePaneMeta } from "../hooks/usePaneMeta";
import type { SessionEntry } from "../hooks/useSessionSections";

export const Route = createFileRoute("/_authenticated/_odin/web/")({
	component: WebPage,
});

/**
 * Your web - every agent on one map. Spokes are repositories, rings are how
 * long ago it started (now, this hour, today, this week), and each session
 * is a node where the two meet: red and glowing when it needs you, blue
 * while it works, a small white dot once it's finished. You sit in the
 * middle. Hover a node to see what it is; click to open it in Home.
 */

const SIZE = 1000;
const CENTER = SIZE / 2;
const RINGS = [
	{ label: "now", r: 120, until: 15 * 60_000 },
	{ label: "this hour", r: 215, until: 60 * 60_000 },
	{ label: "today", r: 310, until: 24 * 60 * 60_000 },
	{ label: "this week", r: 405, until: Number.POSITIVE_INFINITY },
];
const SPOKE = 440;

type Kind = "needs" | "working" | "done";

interface WebNode {
	key: string;
	title: string;
	repo: string;
	kind: Kind;
	at: number;
	paneId?: string;
	sessionId?: string | null;
	pastId?: string;
}

const KIND_LABEL: Record<Kind, string> = {
	needs: "Needs you",
	working: "Working",
	done: "Finished",
};

function folderName(path: string | null | undefined): string {
	return path?.split("/").filter(Boolean).pop() ?? "elsewhere";
}

function ago(at: number): string {
	const minutes = Math.round((Date.now() - at) / 60_000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.round(hours / 24)}d`;
}

function kindOf(entry: SessionEntry): Kind {
	if (entry.column === "permission") return "needs";
	if (entry.column === "working") return "working";
	return "done";
}

function ringOf(at: number): number {
	const age = Date.now() - at;
	return RINGS.findIndex((ring) => age < ring.until);
}

function WebPage() {
	const { sessions } = useSidebarSessions();
	const past = usePastWeek(sessions);
	const tabs = useTabsStore((s) => s.tabs);
	const sessionIdByPane = usePaneMeta((s) => s.sessionIdByPane);
	const [hovered, setHovered] = useState<string | null>(null);
	const openInHome = useOpenInHome();
	const navigate = useNavigate();

	// The repo each agent really works in, not the folder it was launched from.
	const sessionIds = [
		...sessions.map(
			(e) => e.pane.claudeSessionId ?? sessionIdByPane[e.pane.id],
		),
		...past.map((row) => row.sessionId),
	].filter((id): id is string => !!id);
	const repoQueries = electronTrpc.useQueries((t) =>
		sessionIds.map((claudeSessionId) =>
			t.repos.workingRepoName(
				{ claudeSessionId },
				{ retry: false, staleTime: 60_000 },
			),
		),
	);
	const repoBySession = new Map<string, string>();
	sessionIds.forEach((id, i) => {
		const name = repoQueries[i]?.data?.name;
		if (name) repoBySession.set(id, name);
	});
	const repoKey = [...repoBySession].join("|");

	// biome-ignore lint/correctness/useExhaustiveDependencies: repoKey stands for repoBySession, rebuilt each render
	const nodes = useMemo<WebNode[]>(() => {
		const createdAt = new Map(tabs.map((tab) => [tab.id, tab.createdAt]));
		const live = sessions.map((entry) => ({
			key: entry.pane.id,
			title: entry.title,
			repo:
				repoBySession.get(
					entry.pane.claudeSessionId ?? sessionIdByPane[entry.pane.id] ?? "",
				) ??
				folderName(
					entry.pane.odinCwd ?? entry.pane.cwd ?? entry.pane.initialCwd,
				),
			kind: kindOf(entry),
			at:
				createdAt.get(entry.pane.tabId) ??
				entry.pane.odinStatusAt ??
				Date.now(),
			paneId: entry.pane.id,
			sessionId: entry.pane.claudeSessionId ?? sessionIdByPane[entry.pane.id],
		}));
		const finished = past.map((row) => ({
			key: `${PAST}${row.id}`,
			title: row.title,
			repo: repoBySession.get(row.sessionId) ?? folderName(row.cwd),
			kind: "done" as const,
			at: row.startedAt,
			pastId: `${PAST}${row.id}`,
		}));
		return [...live, ...finished];
	}, [sessions, past, tabs, sessionIdByPane, repoKey]);

	// Busiest repos get spokes; the long tail shares one.
	const repos = useMemo(() => {
		const count = new Map<string, number>();
		for (const node of nodes)
			count.set(node.repo, (count.get(node.repo) ?? 0) + 1);
		const ranked = [...count.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([name]) => name);
		return ranked.length > 8 ? [...ranked.slice(0, 7), "other"] : ranked;
	}, [nodes]);

	const angleOf = (repo: string) => {
		const i = repos.includes(repo) ? repos.indexOf(repo) : repos.length - 1;
		return (i / Math.max(repos.length, 1)) * Math.PI * 2 - Math.PI / 2;
	};

	// Nodes sharing a spoke and ring fan out a little so none hide another.
	const placed = useMemo(() => {
		const slot = new Map<string, number>();
		return nodes.map((node) => {
			const ring = ringOf(node.at);
			const id = `${node.repo}:${ring}`;
			const n = slot.get(id) ?? 0;
			slot.set(id, n + 1);
			const spread = (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 0.09;
			const angle = angleOf(node.repo) + spread;
			const r = RINGS[ring].r - 4 - (n > 4 ? 18 : 0);
			return {
				node,
				x: CENTER + Math.cos(angle) * r,
				y: CENTER + Math.sin(angle) * r,
			};
		});
	}, [nodes, angleOf]);

	const counts = {
		needs: nodes.filter((n) => n.kind === "needs").length,
		working: nodes.filter((n) => n.kind === "working").length,
		done: nodes.filter((n) => n.kind === "done").length,
	};
	const focus = placed.find((p) => p.node.key === hovered) ?? null;

	const open = (node: WebNode) => {
		if (node.paneId) openInHome(node.paneId);
		else if (node.pastId) {
			useHomeSelection.getState().select(node.pastId);
			navigate({ to: "/home" });
		}
	};

	return (
		<div className="relative flex h-full min-h-0 flex-col overflow-hidden">
			<div className="flex shrink-0 items-start justify-between gap-4 px-7 pt-6">
				<div className="flex flex-col gap-1.5">
					<h1 className="font-display text-[28px] font-bold tracking-[-0.02em]">
						Your web
					</h1>
					<p className="text-[13px] text-muted-foreground">
						Every agent, by repository and by how long it has been going.
					</p>
				</div>
				<div className="flex gap-2">
					<Legend
						dot="size-2 bg-[#ff4d5e]"
						label="Needs you"
						n={counts.needs}
					/>
					<Legend dot="size-2 bg-working" label="Working" n={counts.working} />
					<Legend
						dot="size-1.5 bg-foreground"
						label="Finished"
						n={counts.done}
					/>
				</div>
			</div>

			<div className="flex min-h-0 flex-1 items-center justify-center p-4">
				<div className="relative aspect-square h-full max-h-full max-w-full">
					<svg
						viewBox={`0 0 ${SIZE} ${SIZE}`}
						className="absolute inset-0 size-full"
						aria-hidden="true"
					>
						{RINGS.map((ring, i) => (
							<g key={ring.label}>
								<circle
									cx={CENTER}
									cy={CENTER}
									r={ring.r}
									fill="none"
									stroke={i === 0 ? "var(--input)" : "var(--border)"}
									strokeWidth={1.2}
								/>
								<text
									x={CENTER + 8}
									y={CENTER - ring.r - 8}
									fill="var(--faint-foreground)"
									fontSize={13}
								>
									{ring.label}
								</text>
							</g>
						))}
						{repos.map((repo) => {
							const a = angleOf(repo);
							return (
								<line
									key={repo}
									x1={CENTER}
									y1={CENTER}
									x2={CENTER + Math.cos(a) * SPOKE}
									y2={CENTER + Math.sin(a) * SPOKE}
									stroke="var(--border)"
									strokeWidth={1.2}
								/>
							);
						})}
						{/* The silk a node hangs from, lit while you hover it. */}
						{focus && (
							<line
								x1={CENTER}
								y1={CENTER}
								x2={focus.x}
								y2={focus.y}
								stroke="var(--primary)"
								strokeOpacity={0.5}
								strokeWidth={1.5}
							/>
						)}
					</svg>

					{repos.map((repo) => {
						const a = angleOf(repo);
						return (
							<span
								key={repo}
								className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-background px-2.5 py-1 text-[12px] font-medium text-soft-foreground"
								style={{
									left: `${((CENTER + Math.cos(a) * (SPOKE + 26)) / SIZE) * 100}%`,
									top: `${((CENTER + Math.sin(a) * (SPOKE + 26)) / SIZE) * 100}%`,
								}}
							>
								{repo}
							</span>
						);
					})}

					{placed.map(({ node, x, y }) => (
						<button
							key={node.key}
							type="button"
							aria-label={`${node.title} - ${KIND_LABEL[node.kind]}`}
							onMouseEnter={() => setHovered(node.key)}
							onFocus={() => setHovered(node.key)}
							onClick={() => open(node)}
							className={cn(
								"absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background transition-transform duration-200 ease-spyd hover:scale-125",
								node.kind === "needs" &&
									"size-3.5 bg-[#ff4d5e] shadow-[0_0_0_6px_rgba(255,77,94,0.18),0_0_18px_rgba(255,77,94,0.45)]",
								node.kind === "working" &&
									"size-3.5 bg-working shadow-[0_0_0_5px_rgba(124,183,255,0.16)]",
								node.kind === "done" && "size-2 bg-foreground",
								hovered === node.key && "scale-125",
							)}
							style={{
								left: `${(x / SIZE) * 100}%`,
								top: `${(y / SIZE) * 100}%`,
							}}
						/>
					))}

					<span className="absolute top-1/2 left-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-background ring-1 ring-input">
						<SpiderMark className="size-[26px]" />
					</span>

					{focus && (
						<NodeCard
							key={focus.node.key}
							node={focus.node}
							left={(focus.x / SIZE) * 100}
							top={(focus.y / SIZE) * 100}
							onOpen={() => open(focus.node)}
							onLeave={() => setHovered(null)}
						/>
					)}
				</div>
			</div>

			{nodes.length === 0 && (
				<p className="absolute inset-x-0 bottom-10 text-center text-[13px] text-muted-foreground">
					Nothing on your web this week. Start a workspace with ⌘N.
				</p>
			)}
		</div>
	);
}

function Legend({ dot, label, n }: { dot: string; label: string; n: number }) {
	return (
		<span className="flex h-[30px] items-center gap-1.5 rounded-full bg-card px-3 text-[13px] text-soft-foreground">
			<span className={cn("rounded-full", dot)} />
			{label} {n}
		</span>
	);
}

/** The hovered node, said in words - and, if it's waiting on a command, Allow. */
function NodeCard({
	node,
	left,
	top,
	onOpen,
	onLeave,
}: {
	node: WebNode;
	left: number;
	top: number;
	onOpen: () => void;
	onLeave: () => void;
}) {
	const { data: tool } = electronTrpc.terminal.pendingTool.useQuery(
		{ sessionId: node.sessionId ?? "" },
		{ enabled: node.kind === "needs" && !!node.sessionId, retry: false },
	);
	const write = electronTrpc.terminal.write.useMutation();
	const plainTool =
		tool && tool.name !== "AskUserQuestion" && tool.name !== "ExitPlanMode";
	const ask = plainTool ? describeTool(tool.name, tool.input) : null;
	// Keep the card on the map: flip it left of nodes on the right half.
	const flip = left > 55;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: hover-out closes the card
		<div
			onMouseLeave={onLeave}
			className="fade-in zoom-in-95 absolute z-10 flex w-[280px] animate-in flex-col gap-1.5 rounded-[18px] bg-card px-4 py-3.5 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.7)] ring-1 ring-inset ring-input duration-150"
			style={{
				left: flip ? undefined : `calc(${left}% + 18px)`,
				right: flip ? `calc(${100 - left}% + 18px)` : undefined,
				top: `calc(${top}% - 30px)`,
			}}
		>
			<span
				className={cn(
					"text-[12px] font-semibold",
					node.kind === "needs"
						? "text-primary-ink"
						: node.kind === "working"
							? "text-working-ink"
							: "text-muted-foreground",
				)}
			>
				{KIND_LABEL[node.kind]} · {ago(node.at)} · {node.repo}
			</span>
			<span className="text-[14px] font-semibold leading-snug">
				{node.title}
			</span>
			{ask && (
				<span className="text-[13px] leading-normal text-muted-foreground">
					Wants to {ask.verb.toLowerCase()} {ask.detail}
				</span>
			)}
			<div className="mt-1 flex gap-1.5">
				{ask && node.paneId && (
					<button
						type="button"
						onClick={() =>
							write.mutate({ paneId: node.paneId ?? "", data: "1" })
						}
						className={cn(
							"h-[30px] rounded-full px-3.5 text-[13px] font-semibold",
							BUTTON.primary,
						)}
					>
						Allow
					</button>
				)}
				<button
					type="button"
					onClick={onOpen}
					className="h-[30px] rounded-full bg-secondary px-3.5 text-[13px] text-foreground hover:bg-input"
				>
					Open
				</button>
			</div>
		</div>
	);
}
