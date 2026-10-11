import { cn } from "@odin/ui/utils";
import { useEffect, useState } from "react";
import { claudeCli } from "renderer/stores/claude-command";
import {
	type PendingWorkspace,
	usePendingWorkspaces,
	useStartWorkspace,
} from "../hooks/useStartWorkspace";

/** Home's selection id for a workspace that's still being made. */
export const PENDING = "pending:";

/**
 * A new session from the moment you press Enter, the way Superset opens a
 * workspace before it exists: what it's doing, the commands it runs, and the
 * seconds on the clock. It turns into the live terminal when Claude is up.
 */
export function PendingSession({ item }: { item: PendingWorkspace }) {
	const { retry } = useStartWorkspace();
	const [started] = useState(() => Date.now());
	const [, tick] = useState(0);
	const failed = item.step === "failed";
	useEffect(() => {
		if (failed) return;
		const timer = setInterval(() => tick((n) => n + 1), 250);
		return () => clearInterval(timer);
	}, [failed]);
	const seconds = ((Date.now() - started) / 1000).toFixed(1);
	const { project, branch } = item.request;
	const base = project.defaultBranch ?? "main";
	const where = `~/.odin/worktrees/${project.name}/${branch || "<branch>"}`;
	const steps: { label: string; command: string }[] = [
		{ label: "Sync with remote", command: `git fetch origin ${base}` },
		{
			label: "Create the worktree",
			command: `git worktree add -b ${branch || "<branch>"} ${where} origin/${base}`,
		},
		{ label: "Copy config", command: "cp .env* .odin/ into the worktree" },
		{ label: "Start Claude", command: claudeCli() },
	];
	// Which step is running, from the worktree job's own stage.
	const at =
		item.step === "agent"
			? 3
			: item.stage === "copying_config" || item.stage === "finalizing"
				? 2
				: item.stage === "creating_worktree"
					? 1
					: 0;
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="shrink-0 border-b border-border px-[18px] py-3">
				<div className="truncate text-[15px] font-semibold">{item.title}</div>
				<div className="text-[12px] text-muted-foreground">
					{project.name} · {failed ? "Failed" : "Starting"} ·{" "}
					<span className="tabular-nums">{seconds}s</span>
				</div>
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-3 bg-background px-[18px] py-4 font-mono text-[12.5px]">
				{steps.map((step, i) => {
					const done = !failed && i < at;
					const now = !failed && i === at;
					return (
						<div key={step.label} className="flex flex-col gap-1">
							<div
								className={cn(
									"flex items-center gap-2",
									done || now ? "text-foreground" : "text-faint-foreground",
								)}
							>
								<span className="w-3 text-center">
									{done ? "✓" : now ? <Spinner /> : "·"}
								</span>
								{step.label}
								{now && item.detail && (
									<span className="text-muted-foreground">- {item.detail}</span>
								)}
							</div>
							<div className="pl-5 text-faint-foreground">$ {step.command}</div>
						</div>
					);
				})}
				{failed && (
					<div className="flex flex-col gap-2 pt-2">
						<div className="cursor-text select-text text-danger-ink">
							{item.error ?? "Something went wrong"}
						</div>
						<div className="flex gap-2 font-sans">
							<button
								type="button"
								onClick={() => retry(item)}
								className="rounded-md bg-primary px-3 py-1 text-[12px] font-medium text-primary-foreground hover:opacity-90"
							>
								Retry
							</button>
							<button
								type="button"
								onClick={() => usePendingWorkspaces.getState().remove(item.id)}
								className="rounded-md px-3 py-1 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
							>
								Dismiss
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function Spinner() {
	return (
		<span className="inline-block size-2.5 animate-spin rounded-full border border-foreground border-t-transparent" />
	);
}
