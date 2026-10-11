import { toast } from "@odin/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useLaunchTaskSession } from "renderer/hooks/useLaunchTaskSession";
import { useOdinWorkspace } from "./useOdinWorkspace";
import { usePendingFocus } from "./usePendingFocus";

export interface ResumableSession {
	sessionId: string;
	/** Where the conversation ran - `claude --resume` only finds it from there. */
	cwd: string | null;
	title: string;
	prompt?: string | null;
}

/**
 * Bring a finished session back: a fresh pane running `claude --resume <id>`
 * in the session's own directory, then over to Home where it's live again.
 * The Archive, Undo on an archived row and Settings > Storage all use it.
 */
export function useResumeSession() {
	const navigate = useNavigate();
	const { ensureWorkspace } = useOdinWorkspace();
	const { launch, isLaunching } = useLaunchTaskSession();

	const resume = async (session: ResumableSession): Promise<boolean> => {
		if (!session.cwd) {
			toast.error(
				"This transcript has no recorded directory - can't resume it",
			);
			return false;
		}
		const ensured = await ensureWorkspace(session.cwd);
		if (!ensured.ok) {
			toast.error(ensured.error);
			return false;
		}
		const result = await launch({
			workspaceId: ensured.workspace.id,
			title: session.title,
			description: null,
			resumeSessionId: session.sessionId,
			// The workspace is the repo root, but a session that ran in a worktree
			// or a subdirectory only resumes from there - otherwise Claude answers
			// "No conversation found".
			repoPath: session.cwd,
			brief: session.prompt ?? null,
		});
		if (!result.ok) {
			toast.error(result.error);
			return false;
		}
		usePendingFocus.getState().focus(result.paneId);
		toast.success(`Resuming "${session.title}"`);
		navigate({ to: "/home" });
		return true;
	};

	return { resume, isResuming: isLaunching };
}
