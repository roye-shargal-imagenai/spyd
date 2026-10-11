import { toast } from "@odin/ui/sonner";
import { cn } from "@odin/ui/utils";
import { createFileRoute } from "@tanstack/react-router";
import type { WorktreeUsage } from "lib/trpc/routers/workspaces/procedures/delete";
import { useEffect, useMemo, useState } from "react";
import { HiCheck, HiOutlineTrash } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { BUTTON } from "../../_odin/components/pill";
import { SettingsPage } from "../components/SettingsPage";

export const Route = createFileRoute("/_authenticated/settings/storage/")({
	component: StorageSettingsPage,
});

const DAY = 86_400_000;
/** Untouched this long, a worktree counts as old. */
const OLD_AFTER_DAYS = 7;

function formatBytes(bytes: number | null): string {
	if (bytes === null) return "-";
	if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
	if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
	return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function ago(at: number): string {
	const days = Math.floor((Date.now() - at) / DAY);
	if (days < 1) return "today";
	if (days === 1) return "yesterday";
	if (days < 14) return `${days} days ago`;
	if (days < 60) return `${Math.round(days / 7)} weeks ago`;
	return `${Math.round(days / 30)} months ago`;
}

/** Nothing lost by deleting it: no edits, nothing unpushed, nothing running. */
const isSafe = (w: WorktreeUsage) =>
	!w.hasChanges && !w.hasUnpushedCommits && w.liveTerminals === 0;

/** What the cleanup picks by default: safe, and either old or its PR is over. */
const isStale = (w: WorktreeUsage) =>
	isSafe(w) &&
	(Date.now() - w.lastActiveAt > OLD_AFTER_DAYS * DAY ||
		w.prState === "merged" ||
		w.prState === "closed");

const sum = (rows: WorktreeUsage[]) =>
	rows.reduce((total, w) => total + (w.bytes ?? 0), 0);

function StorageSettingsPage() {
	const utils = electronTrpc.useUtils();
	const usage = electronTrpc.workspaces.worktreeUsage.useQuery(undefined, {
		staleTime: 60_000,
		refetchOnWindowFocus: false,
	});
	const deleteWorkspace = electronTrpc.workspaces.delete.useMutation();
	const deleteWorktree = electronTrpc.workspaces.deleteWorktree.useMutation();

	// Oldest first: that's what you're here to clear out.
	const rows = useMemo(
		() =>
			[...(usage.data ?? [])].sort((a, b) => a.lastActiveAt - b.lastActiveAt),
		[usage.data],
	);
	const stale = useMemo(() => rows.filter(isStale), [rows]);

	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [picked, setPicked] = useState(false);
	// Start with the stale ones ticked, once the sizes are in.
	useEffect(() => {
		if (picked || !usage.data) return;
		setSelected(new Set(stale.map((w) => w.worktreeId)));
		setPicked(true);
	}, [picked, usage.data, stale]);

	const chosen = rows.filter((w) => selected.has(w.worktreeId));
	const risky = chosen.filter((w) => !isSafe(w));
	const [confirming, setConfirming] = useState(false);
	const [progress, setProgress] = useState<{ done: number; total: number }>();

	const toggle = (id: string) => {
		setConfirming(false);
		setSelected((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const remove = async (targets: WorktreeUsage[]) => {
		setConfirming(false);
		setProgress({ done: 0, total: targets.length });
		let freed = 0;
		const failed: string[] = [];
		// One at a time: each takes the repo's lock anyway, and a failure
		// shouldn't stop the rest.
		for (const [index, w] of targets.entries()) {
			try {
				const result = w.workspaceId
					? await deleteWorkspace.mutateAsync({ id: w.workspaceId })
					: await deleteWorktree.mutateAsync({ worktreeId: w.worktreeId });
				if (result.success) freed += w.bytes ?? 0;
				else failed.push(w.name);
			} catch {
				failed.push(w.name);
			}
			setProgress({ done: index + 1, total: targets.length });
		}
		setProgress(undefined);
		setSelected(new Set());
		await Promise.all([
			utils.workspaces.worktreeUsage.invalidate(),
			utils.workspaces.getAll.invalidate(),
		]);
		const deleted = targets.length - failed.length;
		if (deleted > 0)
			toast.success(
				`Deleted ${deleted} ${deleted === 1 ? "worktree" : "worktrees"} - ${formatBytes(freed)} freed`,
			);
		if (failed.length > 0)
			toast.error(`Couldn't delete ${failed.join(", ")}`, {
				description: "Open it in Home to see what's holding it.",
			});
	};

	const busy = progress !== undefined;

	return (
		<SettingsPage
			title="Storage"
			description="Every workspace keeps its own copy of the repo. Delete the ones you're done with to get the space back."
		>
			<section data-setting="Old worktrees">
				<div className="overflow-hidden rounded-xl border border-border bg-card/60">
					{/* The headline: how much is here, how much can go, one button. */}
					<div className="flex items-center gap-4 px-5 py-4">
						<div className="min-w-0 flex-1">
							{usage.isLoading ? (
								<div className="flex items-center gap-2 text-[13px] text-muted-foreground">
									<span className="size-3.5 animate-spin rounded-full border-2 border-faint-foreground border-t-transparent" />
									Measuring worktrees…
								</div>
							) : (
								<>
									<div className="font-display text-[22px] font-semibold tracking-[-0.02em]">
										{formatBytes(sum(rows))}
										<span className="ml-2 text-[13px] font-normal text-muted-foreground">
											in {rows.length}{" "}
											{rows.length === 1 ? "worktree" : "worktrees"}
										</span>
									</div>
									<div className="mt-0.5 text-[13px] text-muted-foreground">
										{stale.length > 0
											? `${formatBytes(sum(stale))} in ${stale.length} old ${stale.length === 1 ? "worktree" : "worktrees"} you can clear safely`
											: "Nothing old to clear"}
									</div>
								</>
							)}
						</div>
						{!usage.isLoading && (
							<button
								type="button"
								disabled={chosen.length === 0 || busy}
								onClick={() => setConfirming(true)}
								className={cn(
									"flex h-9 shrink-0 items-center gap-2 rounded-md px-4 text-[13px] font-semibold disabled:opacity-40",
									BUTTON.primary,
								)}
							>
								<HiOutlineTrash className="size-4" />
								{busy
									? `Deleting ${progress.done + 1} of ${progress.total}…`
									: chosen.length > 0
										? `Delete ${chosen.length} · free ${formatBytes(sum(chosen))}`
										: "Select worktrees to delete"}
							</button>
						)}
					</div>

					{confirming && (
						<div className="flex items-center gap-3 border-t border-border bg-attention/[0.06] px-5 py-3 text-[13px]">
							<span className="min-w-0 flex-1">
								{risky.length > 0 ? (
									<>
										<span className="font-semibold text-attention-ink">
											{risky.length} of these{" "}
											{risky.length === 1 ? "has" : "have"} unsaved work or a
											running session.
										</span>{" "}
										Deleting loses it.
									</>
								) : (
									<>
										Delete {chosen.length}{" "}
										{chosen.length === 1 ? "worktree" : "worktrees"}? Branches
										and pushed commits stay on GitHub.
									</>
								)}
							</span>
							<button
								type="button"
								onClick={() => setConfirming(false)}
								className={cn(
									"h-8 rounded-md px-3 text-[12.5px] font-medium",
									BUTTON.secondary,
								)}
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={() => void remove(chosen)}
								className={cn(
									"h-8 rounded-md px-3 text-[12.5px] font-semibold",
									BUTTON.primary,
								)}
							>
								Delete {chosen.length}
							</button>
						</div>
					)}

					{rows.length > 0 && (
						<div className="flex items-center gap-3 border-t border-border px-5 py-2 text-[12px] text-faint-foreground">
							<button
								type="button"
								onClick={() => {
									setConfirming(false);
									setSelected(
										chosen.length === rows.length
											? new Set()
											: new Set(rows.map((w) => w.worktreeId)),
									);
								}}
								className="hover:text-foreground"
							>
								{chosen.length === rows.length ? "Select none" : "Select all"}
							</button>
							{stale.length > 0 && (
								<button
									type="button"
									onClick={() => {
										setConfirming(false);
										setSelected(new Set(stale.map((w) => w.worktreeId)));
									}}
									className="hover:text-foreground"
								>
									Select old only
								</button>
							)}
							<span className="ml-auto">Oldest first</span>
						</div>
					)}

					<div className="divide-y divide-border border-t border-border">
						{rows.map((w) => (
							<WorktreeRow
								key={w.worktreeId}
								worktree={w}
								checked={selected.has(w.worktreeId)}
								disabled={busy}
								onToggle={() => toggle(w.worktreeId)}
							/>
						))}
					</div>
				</div>
				<p className="mt-3 px-1 text-[12.5px] text-muted-foreground">
					Deleting removes the worktree folder and closes its terminals. The
					branch, anything pushed and the conversation in the Archive all stay.
					Ticked by default: untouched for {OLD_AFTER_DAYS}+ days or PR merged,
					with nothing unsaved.
				</p>
			</section>
		</SettingsPage>
	);
}

function WorktreeRow({
	worktree: w,
	checked,
	disabled,
	onToggle,
}: {
	worktree: WorktreeUsage;
	checked: boolean;
	disabled: boolean;
	onToggle: () => void;
}) {
	const tags = [
		w.liveTerminals > 0 && { label: "Running", tone: "text-working-ink" },
		w.hasChanges && { label: "Unsaved changes", tone: "text-attention-ink" },
		w.hasUnpushedCommits && {
			label: "Unpushed commits",
			tone: "text-attention-ink",
		},
		w.prState === "merged" && { label: "PR merged", tone: "text-success-ink" },
		w.prState === "closed" && {
			label: "PR closed",
			tone: "text-muted-foreground",
		},
		w.prState === "open" && { label: "PR open", tone: "text-link" },
	].filter(Boolean) as { label: string; tone: string }[];
	return (
		<label
			className={cn(
				"flex cursor-default items-center gap-3 px-5 py-2.5 transition-colors hover:bg-white/[0.03]",
				disabled && "opacity-60",
			)}
			title={w.path}
		>
			<input
				type="checkbox"
				checked={checked}
				disabled={disabled}
				onChange={onToggle}
				className="peer sr-only"
			/>
			<span
				aria-hidden
				className={cn(
					"flex size-4 shrink-0 items-center justify-center rounded-[4px] ring-1 ring-inset transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
					checked
						? "bg-highlight text-white ring-highlight"
						: "ring-input bg-transparent",
				)}
			>
				{checked && <HiCheck className="size-3" strokeWidth={1.5} />}
			</span>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="truncate text-[13px] font-medium text-foreground">
					{w.name}
				</span>
				<span className="flex min-w-0 items-center gap-2 text-[12px] text-faint-foreground">
					<span className="truncate">
						{[w.project, ago(w.lastActiveAt)].filter(Boolean).join(" · ")}
					</span>
					{tags.map((tag) => (
						<span key={tag.label} className={cn("shrink-0", tag.tone)}>
							{tag.label}
						</span>
					))}
				</span>
			</span>
			<span className="w-16 shrink-0 text-right text-[13px] tabular-nums text-soft-foreground">
				{formatBytes(w.bytes)}
			</span>
		</label>
	);
}
