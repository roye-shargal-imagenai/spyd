import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@odin/ui/command";
import { toast } from "@odin/ui/sonner";
import type { SupersetWorkspace } from "lib/trpc/routers/superset";
import { LuGitBranch } from "react-icons/lu";
import { useLaunchTaskSession } from "renderer/hooks/useLaunchTaskSession";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { create } from "zustand";
import { useOdinWorkspace } from "../hooks/useOdinWorkspace";
import { usePaneMeta } from "../hooks/usePaneMeta";
import { useOpenSession } from "./SessionList";

export const useSupersetImport = create<{
	isOpen: boolean;
	setOpen: (isOpen: boolean) => void;
}>((set) => ({
	isOpen: false,
	setOpen: (isOpen) => set({ isOpen }),
}));

function ago(at: number | null): string {
	if (!at) return "";
	const minutes = Math.round((Date.now() - at) / 60_000);
	if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.round(hours / 24)}d ago`;
}

/**
 * Bring a Superset workspace over: its Claude conversation resumes here
 * (`claude --resume`) inside the same worktree, so the history and the
 * uncommitted work come with it. Superset is only read - the workspace stays
 * there too, untouched.
 */
export function SupersetImport() {
	const isOpen = useSupersetImport((s) => s.isOpen);
	const setOpen = useSupersetImport((s) => s.setOpen);
	const { data: workspaces = [], isLoading } =
		electronTrpc.superset.workspaces.useQuery(undefined, { enabled: isOpen });
	const { ensureWorkspace } = useOdinWorkspace();
	const { launch } = useLaunchTaskSession();
	const openSession = useOpenSession();

	const bringOver = async (workspace: SupersetWorkspace) => {
		setOpen(false);
		const ensured = await ensureWorkspace();
		if (!ensured.ok) {
			toast.error(ensured.error);
			return;
		}
		const result = await launch({
			workspaceId: ensured.workspace.id,
			title: workspace.name,
			description: null,
			repoPath: workspace.worktreePath,
			tags: ["superset"],
			// No conversation to resume: a fresh agent in the same worktree.
			...(workspace.claudeSessionId
				? { resumeSessionId: workspace.claudeSessionId }
				: { noPrompt: true }),
		});
		if (!result.ok) {
			toast.error(result.error);
			return;
		}
		usePaneMeta.getState().setTitle(result.paneId, workspace.name);
		usePaneMeta.getState().setSessionId(result.paneId, result.sessionId);
		openSession(result.paneId);
		toast.success(
			workspace.claudeSessionId
				? `Picked up "${workspace.name}" from Superset`
				: `Opened ${workspace.branch} from Superset (no conversation to resume)`,
		);
	};

	const usable = workspaces.filter((w) => w.exists);

	return (
		<CommandDialog
			open={isOpen}
			onOpenChange={setOpen}
			title="Import from Superset"
			description="Pick up a Superset workspace and its Claude conversation"
			showCloseButton={false}
			className="top-[18vh] max-w-[640px] translate-y-0 rounded-md border-border bg-popover sm:max-w-[640px]"
		>
			<CommandInput placeholder="Find a Superset workspace by task, repo or branch…" />
			<CommandList className="max-h-[440px]">
				<CommandEmpty>
					{isLoading
						? "Reading Superset…"
						: workspaces.length === 0
							? "No Superset workspaces found on this Mac."
							: "Nothing matches."}
				</CommandEmpty>
				{usable.length > 0 && (
					<CommandGroup heading="Superset workspaces - Enter resumes it here">
						{usable.map((workspace) => (
							<CommandItem
								key={workspace.id}
								value={`${workspace.name} ${workspace.projectName} ${workspace.branch} ${workspace.id}`}
								onSelect={() => void bringOver(workspace)}
								className="items-start gap-2.5 rounded-md px-2.5 py-2"
							>
								<LuGitBranch className="mt-0.5" />
								<span className="min-w-0 flex-1">
									<span className="block truncate text-[13px] text-foreground">
										{workspace.name}
									</span>
									<span className="block truncate text-[11px] text-muted-foreground">
										{[
											workspace.projectName,
											workspace.branch,
											ago(workspace.lastActivityAt),
											!workspace.claudeSessionId && "no conversation",
										]
											.filter(Boolean)
											.join(" · ")}
									</span>
								</span>
							</CommandItem>
						))}
					</CommandGroup>
				)}
			</CommandList>
		</CommandDialog>
	);
}
