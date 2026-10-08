import { workspaces, worktrees } from "@odin/local-db";
import { deduplicateBranchName } from "@odin/shared/workspace-launch";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { workspaceInitManager } from "main/lib/workspace-init-manager";
import type { WorkspaceInitProgress } from "shared/types/workspace-init";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import { getPresetsForTrigger } from "../../settings";
import { getProject, getWorkspaceWithRelations } from "../utils/db-helpers";
import { listBranches } from "../utils/git";
import { resolveWorktreePath } from "../utils/resolve-worktree-path";
import { loadSetupConfig } from "../utils/setup";
import { execWithShellEnv } from "../utils/shell-env";
import { initializeWorkspaceWorktree } from "../utils/workspace-init";

type WorkspaceRelations = NonNullable<
	ReturnType<typeof getWorkspaceWithRelations>
>;

function getRetryInitRelations(workspaceId: string): {
	workspace: WorkspaceRelations["workspace"];
	worktree: NonNullable<WorkspaceRelations["worktree"]>;
	project: NonNullable<WorkspaceRelations["project"]>;
} {
	const relations = getWorkspaceWithRelations(workspaceId);
	if (!relations) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Workspace not found",
		});
	}

	const { workspace, worktree, project } = relations;
	if (workspace.deletingAt) {
		throw new Error("Cannot retry initialization on a workspace being deleted");
	}
	if (!worktree) {
		throw new Error("Worktree not found");
	}
	if (!project) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Project not found",
		});
	}

	return { workspace, worktree, project };
}

function persistRetryBranchUpdate({
	workspace,
	worktreeId,
	branch,
	path,
}: {
	workspace: WorkspaceRelations["workspace"];
	worktreeId: string;
	branch: string;
	path: string;
}): void {
	localDb
		.update(worktrees)
		.set({ branch, path })
		.where(eq(worktrees.id, worktreeId))
		.run();

	localDb
		.update(workspaces)
		.set({
			branch,
			...(workspace.isUnnamed ? { name: branch } : {}),
		})
		.where(eq(workspaces.id, workspace.id))
		.run();
}

async function resolveRetryTarget({
	workspace,
	worktree,
	project,
	deduplicateBranchName: shouldDeduplicateBranchName,
}: {
	workspace: WorkspaceRelations["workspace"];
	worktree: NonNullable<WorkspaceRelations["worktree"]>;
	project: NonNullable<WorkspaceRelations["project"]>;
	deduplicateBranchName: boolean;
}): Promise<{ branch: string; worktreePath: string }> {
	const currentBranch = worktree.branch;
	const currentPath = worktree.path;

	if (!shouldDeduplicateBranchName) {
		return { branch: currentBranch, worktreePath: currentPath };
	}

	const { local, remote } = await listBranches(project.mainRepoPath);
	const deduplicatedBranch = deduplicateBranchName(currentBranch, [
		...local,
		...remote,
	]);
	if (deduplicatedBranch === currentBranch) {
		return { branch: currentBranch, worktreePath: currentPath };
	}

	const deduplicatedPath = resolveWorktreePath(project, deduplicatedBranch);
	persistRetryBranchUpdate({
		workspace,
		worktreeId: worktree.id,
		branch: deduplicatedBranch,
		path: deduplicatedPath,
	});

	return { branch: deduplicatedBranch, worktreePath: deduplicatedPath };
}

export const createInitProcedures = () => {
	return router({
		onInitProgress: publicProcedure
			.input(
				z.object({ workspaceIds: z.array(z.string()).optional() }).optional(),
			)
			.subscription(({ input }) => {
				return observable<WorkspaceInitProgress>((emit) => {
					const handler = (progress: WorkspaceInitProgress) => {
						if (
							input?.workspaceIds &&
							!input.workspaceIds.includes(progress.workspaceId)
						) {
							return;
						}
						emit.next(progress);
					};

					for (const progress of workspaceInitManager.getAllProgress()) {
						if (
							!input?.workspaceIds ||
							input.workspaceIds.includes(progress.workspaceId)
						) {
							emit.next(progress);
						}
					}

					workspaceInitManager.on("progress", handler);

					return () => {
						workspaceInitManager.off("progress", handler);
					};
				});
			}),

		retryInit: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					deduplicateBranchName: z.boolean().optional().default(false),
				}),
			)
			.mutation(async ({ input }) => {
				const { workspace, worktree, project } = getRetryInitRelations(
					input.workspaceId,
				);
				const { branch, worktreePath } = await resolveRetryTarget({
					workspace,
					worktree,
					project,
					deduplicateBranchName: input.deduplicateBranchName,
				});

				workspaceInitManager.clearJob(input.workspaceId);
				workspaceInitManager.startJob(input.workspaceId, workspace.projectId);

				initializeWorkspaceWorktree({
					workspaceId: input.workspaceId,
					projectId: workspace.projectId,
					worktreeId: worktree.id,
					worktreePath,
					branch,
					mainRepoPath: project.mainRepoPath,
				});

				return { success: true };
			}),

		getInitProgress: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(({ input }) => {
				return workspaceInitManager.getProgress(input.workspaceId) ?? null;
			}),

		/**
		 * spyd: run a new worktree's setup commands (the repo's setup config -
		 * install deps, copy .env) before its agent starts, the way Superset
		 * readies a workspace. One login shell per command, in the worktree;
		 * stops at the first failure and says which, with its output tail.
		 */
		runSetup: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.mutation(async ({ input }) => {
				const relations = getWorkspaceWithRelations(input.workspaceId);
				const project = relations
					? getProject(relations.workspace.projectId)
					: null;
				const cwd = relations?.worktree?.path;
				if (!relations || !project || !cwd) return { ran: 0 };
				const commands =
					loadSetupConfig({
						mainRepoPath: project.mainRepoPath,
						worktreePath: cwd,
						projectId: project.id,
					})?.setup ?? [];
				for (const [i, command] of commands.entries()) {
					try {
						await execWithShellEnv("/bin/zsh", ["-lc", command], {
							cwd,
							timeout: 10 * 60_000,
							maxBuffer: 16 * 1024 * 1024,
						});
					} catch (error) {
						const output =
							error && typeof error === "object" && "stderr" in error
								? String((error as { stderr: unknown }).stderr)
								: String(error);
						return {
							ran: i,
							failed: command,
							output: output.trim().split("\n").slice(-6).join("\n"),
						};
					}
				}
				return { ran: commands.length };
			}),

		getSetupCommands: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(({ input }) => {
				const relations = getWorkspaceWithRelations(input.workspaceId);

				if (!relations) {
					return null;
				}

				const project = getProject(relations.workspace.projectId);

				if (!project) {
					return null;
				}

				const setupConfig = loadSetupConfig({
					mainRepoPath: project.mainRepoPath,
					worktreePath: relations.worktree?.path,
					projectId: project.id,
				});
				const defaultPresets = getPresetsForTrigger(
					"applyOnWorkspaceCreated",
					project.id,
				);

				return {
					projectId: project.id,
					initialCommands: setupConfig?.setup ?? null,
					defaultPresets,
				};
			}),
	});
};
