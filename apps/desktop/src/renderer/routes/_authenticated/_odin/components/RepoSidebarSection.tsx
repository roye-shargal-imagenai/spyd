import type { SelectProject } from "@odin/local-db";
import { toast } from "@odin/ui/sonner";
import { cn } from "@odin/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
	HiChevronRight,
	HiOutlineArrowDownTray,
	HiOutlineFolder,
	HiOutlineFolderOpen,
	HiOutlinePlus,
} from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { usePendingFocus } from "../hooks/usePendingFocus";
import type { SessionEntry } from "../hooks/useSessionSections";
import {
	type PendingWorkspace,
	usePendingWorkspaces,
	useStartWorkspace,
} from "../hooks/useStartWorkspace";
import {
	NewWorkspaceDialog,
	useNewWorkspaceDialog,
} from "./NewWorkspaceDialog";

import { useSupersetImport } from "./SupersetImport";

/** What a session's dot looks like, by the board column it's in. */
export const SESSION_DOT: Record<string, string> = {
	working: "bg-working animate-pulse",
	permission: "bg-primary",
	review: "border border-success",
	idle: "bg-faint-foreground/60",
};

const ROW =
	"flex h-8 w-full items-center gap-2 rounded-[12px] px-2.5 text-left text-[13px] transition-colors hover:bg-accent/60 hover:text-foreground";

/**
 * The repos you keep on this machine, Superset-style: add one from disk once,
 * then start a workspace in it from here - a fresh worktree on its own branch
 * with an agent on your prompt. A repo opens to show the sessions working in
 * it; one session can touch several repos, so this is a way in, not the
 * board's grouping.
 */
export function RepoSidebarSection({ entries }: { entries: SessionEntry[] }) {
	const utils = electronTrpc.useUtils();
	const { data: projects = [] } = electronTrpc.projects.getRecents.useQuery();
	const { data: workspaces = [] } = electronTrpc.workspaces.getAll.useQuery();
	const tabs = useTabsStore((s) => s.tabs);
	const openNew = electronTrpc.projects.openNew.useMutation({
		onSuccess: (result) => {
			void utils.projects.getRecents.invalidate();
			if ("error" in result && result.error) toast.error(result.error);
		},
		onError: (error) => toast.error(error.message),
	});
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [collapsed, setCollapsed] = useState(false);
	const openDialog = useNewWorkspaceDialog((s) => s.open);
	const pending = usePendingWorkspaces((s) => s.items);
	const { start, retry } = useStartWorkspace();
	/**
	 * +: straight to a workspace, Superset-style - a worktree on a fresh
	 * branch, the agent waiting at its prompt, opened the moment it's up.
	 * ⌥-click (or ⌘N) asks what it's for first.
	 */
	const newWorkspace = (project: SelectProject, event: { altKey: boolean }) =>
		event.altKey
			? openDialog(project.id)
			: start({
					project,
					prompt: "",
					images: [],
					branch: "",
					openWhenReady: true,
				});
	const navigate = useNavigate();

	const projectOfWorkspace = new Map(
		workspaces.map((workspace) => [workspace.id, workspace.projectId]),
	);
	const workspaceOfTab = new Map(tabs.map((tab) => [tab.id, tab.workspaceId]));
	/** A session is in a repo if it runs in one of its workspaces or under it. */
	const sessionsIn = (project: SelectProject) =>
		entries.filter((entry) => {
			const workspaceId = workspaceOfTab.get(entry.pane.tabId);
			if (workspaceId && projectOfWorkspace.get(workspaceId) === project.id)
				return true;
			const cwd = entry.pane.odinCwd ?? entry.pane.cwd ?? entry.pane.initialCwd;
			return (
				!!cwd &&
				(cwd === project.mainRepoPath ||
					cwd.startsWith(`${project.mainRepoPath}/`))
			);
		});

	const toggle = (id: string) =>
		setExpanded((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	const openSession = (paneId: string) => {
		usePendingFocus.getState().focus(paneId);
		navigate({ to: "/home" });
	};

	return (
		<div className="flex flex-col gap-0.5">
			<div className="group/head flex items-center justify-between px-2.5 pb-1.5 text-[12px] font-medium text-faint-foreground">
				<button
					type="button"
					onClick={() => setCollapsed((c) => !c)}
					className="flex items-center gap-1 hover:text-muted-foreground"
				>
					Repositories
					<HiChevronRight
						className={cn(
							"size-3 opacity-0 transition-[transform,opacity] group-hover/head:opacity-100",
							!collapsed && "rotate-90",
						)}
					/>
					{collapsed && <span className="tabular-nums">{projects.length}</span>}
				</button>
				<span className="flex items-center gap-0.5">
					<button
						type="button"
						aria-label="Import from Superset"
						title="Pick up a workspace from Superset, with its conversation"
						onClick={() => useSupersetImport.getState().setOpen(true)}
						className="flex size-[22px] items-center justify-center rounded-full hover:bg-accent/60 hover:text-foreground"
					>
						<HiOutlineArrowDownTray className="size-3.5" />
					</button>
					<button
						type="button"
						aria-label="Add repository"
						title="Add a repository from this computer"
						disabled={openNew.isPending}
						onClick={() => openNew.mutate()}
						className="flex size-[22px] items-center justify-center rounded-full hover:bg-accent/60 hover:text-foreground disabled:opacity-50"
					>
						<HiOutlinePlus className="size-3.5" />
					</button>
				</span>
			</div>
			{!collapsed && projects.length === 0 && (
				<button
					type="button"
					onClick={() => openNew.mutate()}
					className={cn(ROW, "text-faint-foreground")}
				>
					<HiOutlinePlus className="size-3.5 shrink-0" />
					Add a repository
				</button>
			)}
			{!collapsed &&
				projects.map((project) => {
					const sessions = sessionsIn(project);
					const making = pending.filter(
						(item) => item.request.project.id === project.id,
					);
					// A workspace on its way opens its repo: that's where it shows up.
					const isOpen = expanded.has(project.id) || making.length > 0;
					return (
						<div key={project.id} className="flex flex-col gap-0.5">
							<div className="group flex items-center">
								<button
									type="button"
									title={project.mainRepoPath}
									onClick={() => toggle(project.id)}
									className={cn(
										ROW,
										"h-[30px] min-w-0 flex-1 text-soft-foreground",
										isOpen && "text-foreground",
									)}
								>
									{isOpen ? (
										<HiOutlineFolderOpen className="size-[15px] shrink-0 text-faint-foreground" />
									) : (
										<HiOutlineFolder className="size-[15px] shrink-0 text-faint-foreground" />
									)}
									<span className="min-w-0 flex-1 truncate">
										{project.name}
									</span>
									{sessions.some((entry) => entry.column === "permission") && (
										<span
											role="img"
											aria-label="A session needs you"
											className="size-1.5 shrink-0 rounded-full bg-primary"
										/>
									)}
									{sessions.length > 0 && (
										<span className="min-w-2.5 shrink-0 text-right text-[12px] tabular-nums text-faint-foreground group-hover:invisible">
											{sessions.length}
										</span>
									)}
								</button>
								<button
									type="button"
									aria-label={`New workspace in ${project.name}`}
									title={`New workspace in ${project.name} (⌥-click to describe it first)`}
									onClick={(event) => newWorkspace(project, event)}
									className="-ml-8 flex size-[26px] shrink-0 items-center justify-center rounded-full text-faint-foreground opacity-0 transition-[opacity,color] hover:bg-primary hover:text-primary-foreground group-hover:opacity-100 focus-visible:opacity-100"
								>
									<HiOutlinePlus className="size-3.5" />
								</button>
							</div>
							{isOpen && (
								<div className="flex flex-col gap-0.5 pb-1 pl-[25px]">
									{making.map((item) => (
										<PendingRow
											key={item.id}
											item={item}
											onRetry={() => retry(item)}
											onDismiss={() =>
												usePendingWorkspaces.getState().remove(item.id)
											}
										/>
									))}
									{sessions.length === 0 && making.length === 0 && (
										<button
											type="button"
											onClick={(event) => newWorkspace(project, event)}
											className={cn(
												ROW,
												"h-7 text-[12px] text-faint-foreground",
											)}
										>
											+ New workspace
										</button>
									)}
									{sessions.map((entry) => (
										<button
											key={entry.pane.id}
											type="button"
											title={entry.title}
											onClick={() => openSession(entry.pane.id)}
											className={cn(
												ROW,
												"h-7 text-[12px] text-soft-foreground",
											)}
										>
											<span
												aria-hidden
												className={cn(
													"size-[7px] shrink-0 rounded-full",
													SESSION_DOT[entry.column] ?? SESSION_DOT.idle,
												)}
											/>
											<span className="min-w-0 flex-1 truncate">
												{entry.title}
											</span>
										</button>
									))}
								</div>
							)}
						</div>
					);
				})}

			<NewWorkspaceDialog projects={projects} />
		</div>
	);
}

const STEP_LABEL: Record<PendingWorkspace["step"], string> = {
	worktree: "Creating worktree…",
	setup: "Running setup…",
	agent: "Starting agent…",
	failed: "Failed",
};

/** A workspace on its way up: what it's doing now, or why it stopped. */
function PendingRow({
	item,
	onRetry,
	onDismiss,
}: {
	item: PendingWorkspace;
	onRetry: () => void;
	onDismiss: () => void;
}) {
	const failed = item.step === "failed";
	return (
		<div
			title={item.error ?? item.title}
			className="flex flex-col gap-0.5 rounded-[12px] px-2.5 py-1.5 text-[12px]"
		>
			<div className="flex items-center gap-2">
				{failed ? (
					<span
						aria-hidden
						className="size-1.5 shrink-0 rounded-full bg-danger"
					/>
				) : (
					<span
						aria-hidden
						className="size-2.5 shrink-0 animate-spin rounded-full border border-faint-foreground border-t-transparent"
					/>
				)}
				<span className="min-w-0 flex-1 truncate text-soft-foreground">
					{item.title}
				</span>
			</div>
			<div className="flex items-center gap-2 pl-[18px] text-[11px] text-faint-foreground">
				<span
					className={cn("min-w-0 flex-1 truncate", failed && "text-danger-ink")}
				>
					{failed ? (item.error ?? "Failed") : STEP_LABEL[item.step]}
				</span>
				{failed && (
					<>
						<button
							type="button"
							onClick={onRetry}
							className="shrink-0 font-semibold text-soft-foreground hover:text-foreground"
						>
							Retry
						</button>
						<button
							type="button"
							onClick={onDismiss}
							className="shrink-0 hover:text-foreground"
						>
							Dismiss
						</button>
					</>
				)}
			</div>
		</div>
	);
}
