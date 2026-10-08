import type { SelectProject } from "@odin/local-db";
import { toast } from "@odin/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useLaunchTaskSession } from "renderer/hooks/useLaunchTaskSession";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { create } from "zustand";
import { type PromptImage, sessionTitle } from "../components/OdinPromptDialog";
import { useHomeSelection } from "../components/SessionPane";
import { usePaneMeta } from "./usePaneMeta";

const READY_POLL_MS = 400;
// `git worktree add` plus a fetch; a slow remote can take a while, but a
// minute and a half without "ready" means something is stuck, not slow.
const READY_TIMEOUT_MS = 90_000;

export interface WorkspaceRequest {
	project: SelectProject;
	prompt: string;
	images: PromptImage[];
	/** Exact branch to create - empty lets the server pick a friendly name. */
	branch: string;
	/** Open the session as soon as it's up - the + button's whole promise. */
	openWhenReady?: boolean;
}

export interface PendingWorkspace {
	id: string;
	request: WorkspaceRequest;
	title: string;
	step: "worktree" | "setup" | "agent" | "failed";
	error?: string;
}

/**
 * Workspaces being made right now. The dialog closes the moment you press
 * Enter; the row lives here - and in the sidebar under its repo - until the
 * session is up, or says why it isn't with a Retry. In memory only: a
 * restart mid-create leaves the worktree, not a ghost row.
 */
export const usePendingWorkspaces = create<{
	items: PendingWorkspace[];
	put: (item: PendingWorkspace) => void;
	patch: (id: string, patch: Partial<PendingWorkspace>) => void;
	remove: (id: string) => void;
}>((set) => ({
	items: [],
	put: (item) =>
		set((state) => ({
			items: [...state.items.filter((i) => i.id !== item.id), item],
		})),
	patch: (id, patch) =>
		set((state) => ({
			items: state.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
		})),
	remove: (id) =>
		set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
}));

/**
 * A new workspace in a repo, the way Superset makes one: a fresh git worktree
 * on its own branch, then an agent started inside it with your prompt. Its own
 * checkout is the point - two workspaces in one repo don't wait on each other
 * (the launch gate allows one agent per checkout), and neither touches the
 * branch you have checked out.
 *
 * `start` returns at once; progress is in `usePendingWorkspaces`.
 */
export function useStartWorkspace() {
	const utils = electronTrpc.useUtils();
	const create = electronTrpc.workspaces.create.useMutation();
	const { launch } = useLaunchTaskSession();
	const navigate = useNavigate();

	const waitUntilReady = async (
		workspaceId: string,
	): Promise<string | null> => {
		for (
			const end = Date.now() + READY_TIMEOUT_MS;
			Date.now() < end;
			await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS))
		) {
			const progress = await utils.client.workspaces.getInitProgress.query({
				workspaceId,
			});
			// No progress = the init job finished and was cleared.
			if (!progress || progress.step === "ready") return null;
			if (progress.step === "failed")
				return progress.error ?? progress.message ?? "Worktree setup failed";
		}
		return "the worktree took too long to set up";
	};

	const run = async (id: string, request: WorkspaceRequest) => {
		const { project, images, branch } = request;
		const prompt = request.prompt.trim();
		const store = usePendingWorkspaces.getState();
		const fail = (error: string) => store.patch(id, { step: "failed", error });
		store.patch(id, { step: "worktree", error: undefined });
		try {
			const created = await create.mutateAsync({
				projectId: project.id,
				// The preview showed this exact name, so no prefix on top of it.
				...(branch ? { branchName: branch, applyPrefix: false } : {}),
				prompt: prompt || undefined,
			});
			if (created.isInitializing) {
				const error = await waitUntilReady(created.workspace.id);
				if (error) return fail(error);
			}
			void utils.workspaces.getAll.invalidate();
			// The repo's own setup (deps, .env) first, so the agent's first
			// build works. A failure is said, not fatal - the agent can fix it.
			if (created.initialCommands?.length) {
				store.patch(id, { step: "setup" });
				const setup = await utils.client.workspaces.runSetup.mutate({
					workspaceId: created.workspace.id,
				});
				if ("failed" in setup && setup.failed)
					toast.warning(`Setup step failed: ${setup.failed}`, {
						description: setup.output,
					});
			}
			store.patch(id, { step: "agent" });
			const title = sessionTitle(prompt, created.workspace.branch);
			const result = await launch({
				workspaceId: created.workspace.id,
				repoPath: created.worktreePath,
				title,
				description: prompt && prompt !== title ? prompt : null,
				images,
				// Nothing asked yet: the agent opens at its prompt, waiting for you.
				noPrompt: !prompt && images.length === 0,
			});
			if (!result.ok) return fail(result.error);
			usePaneMeta.getState().setBrief(result.paneId, prompt || title);
			usePaneMeta.getState().setTitle(result.paneId, title);
			usePaneMeta.getState().setSessionId(result.paneId, result.sessionId);
			store.remove(id);
			if (request.openWhenReady) {
				useHomeSelection.getState().select(result.paneId, "session");
				navigate({ to: "/home" });
			} else {
				toast.success(`${created.workspace.branch} is up in ${project.name}`);
			}
		} catch (error) {
			fail(error instanceof Error ? error.message : String(error));
		}
	};

	const start = (request: WorkspaceRequest) => {
		const id = crypto.randomUUID();
		const prompt = request.prompt.trim();
		usePendingWorkspaces.getState().put({
			id,
			request,
			title: prompt
				? sessionTitle(prompt, "New workspace")
				: request.branch || "New workspace",
			step: "worktree",
		});
		void run(id, request);
	};

	const retry = (item: PendingWorkspace) => void run(item.id, item.request);

	return { start, retry };
}
