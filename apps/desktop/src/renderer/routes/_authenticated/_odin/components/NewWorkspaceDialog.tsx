import type { SelectProject } from "@odin/local-db";
import {
	deduplicateBranchName,
	deriveWorkspaceBranchFromPrompt,
	sanitizeBranchNameWithMaxLength,
} from "@odin/shared/workspace-launch";
import { cn } from "@odin/ui/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { HiOutlineXMark } from "react-icons/hi2";
import { LuGitBranch } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { create } from "zustand";
import { useStartWorkspace } from "../hooks/useStartWorkspace";
import type { PromptImage } from "./OdinPromptDialog";
import { BUTTON } from "./pill";
import { MODES, type WorkspaceMode, withMode } from "./workspace-modes";

/**
 * Who has the New workspace box open, and on which repo. A store, not
 * state, so ⌘N in the shell and a repo's + in the sidebar open the same box.
 * Drafts are kept per repo for the app's lifetime: Esc by accident costs
 * nothing, and creating clears it.
 */
export const useNewWorkspaceDialog = create<{
	projectId: string | null;
	lastProjectId: string | null;
	/** The mode you used last - most days are mostly one kind of work. */
	mode: WorkspaceMode;
	drafts: Record<string, string>;
	open: (projectId?: string | null) => void;
	close: () => void;
	setDraft: (projectId: string, text: string) => void;
}>((set, get) => ({
	projectId: null,
	lastProjectId: null,
	mode: "build",
	drafts: {},
	open: (projectId) => {
		const id = projectId ?? get().lastProjectId;
		set({ projectId: id ?? "" });
	},
	close: () => set({ projectId: null }),
	setDraft: (projectId, text) =>
		set((state) => ({ drafts: { ...state.drafts, [projectId]: text } })),
}));

const readImage = (file: File) =>
	new Promise<PromptImage>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () =>
			resolve({ name: file.name, dataUrl: String(reader.result) });
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});

/**
 * New workspace, built to be fast: one prompt box, the repo as a row of chips
 * you can switch without leaving it, and the branch it will create shown live
 * underneath (click to rename). Enter creates and the box closes at once - the
 * worktree and agent come up in the background, their progress on the repo's
 * row in the sidebar. An empty prompt is fine: the agent opens and waits.
 */
export function NewWorkspaceDialog({
	projects,
}: {
	projects: SelectProject[];
}) {
	const projectId = useNewWorkspaceDialog((s) => s.projectId);
	if (projectId === null || projects.length === 0) return null;
	const project =
		projects.find((p) => p.id === projectId) ?? (projects[0] as SelectProject);
	return (
		<DialogBody key="new-workspace" projects={projects} initial={project} />
	);
}

function DialogBody({
	projects,
	initial,
}: {
	projects: SelectProject[];
	initial: SelectProject;
}) {
	const { close, setDraft } = useNewWorkspaceDialog.getState();
	const drafts = useNewWorkspaceDialog((s) => s.drafts);
	const mode = useNewWorkspaceDialog((s) => s.mode);
	const [project, setProject] = useState(initial);
	const prompt = drafts[project.id] ?? "";
	const [images, setImages] = useState<PromptImage[]>([]);
	const [branchEdit, setBranchEdit] = useState<string | null>(null);
	const textarea = useRef<HTMLTextAreaElement>(null);
	const { start } = useStartWorkspace();

	const { data: branchData } = electronTrpc.projects.getBranchesLocal.useQuery(
		{ projectId: project.id },
		{ staleTime: 30_000 },
	);
	const baseBranch =
		branchData?.defaultBranch ?? project.defaultBranch ?? "main";
	const derived = useMemo(() => {
		const firstLine = prompt.trim().split("\n")[0] ?? "";
		if (!firstLine) return "";
		return deduplicateBranchName(
			deriveWorkspaceBranchFromPrompt(firstLine),
			(branchData?.branches ?? []).map((b) => b.name),
		);
	}, [prompt, branchData]);
	const branch =
		branchEdit !== null
			? sanitizeBranchNameWithMaxLength(branchEdit.trim())
			: derived;

	// Autosize: grow with the text up to a ceiling, then scroll.
	// biome-ignore lint/correctness/useExhaustiveDependencies: prompt is the trigger
	useEffect(() => {
		const el = textarea.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
	}, [prompt]);

	// Focus lands back in the prompt whenever the repo changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: project is the trigger
	useEffect(() => {
		textarea.current?.focus();
	}, [project.id]);

	const switchRepo = (offset: number) => {
		const i = projects.findIndex((p) => p.id === project.id);
		const next = projects[(i + offset + projects.length) % projects.length];
		if (next) setProject(next);
		setBranchEdit(null);
	};

	const submit = () => {
		// The branch is named from what you typed, not the mode's brief.
		start({ project, prompt: withMode(mode, prompt), images, branch });
		setDraft(project.id, "");
		useNewWorkspaceDialog.setState({ lastProjectId: project.id });
		close();
	};

	return (
		<>
			<button
				type="button"
				aria-label="Close"
				onClick={close}
				className="fade-in fixed inset-0 z-40 animate-in cursor-default bg-black/50 duration-150"
			/>
			<div
				role="dialog"
				aria-label="New workspace"
				className="fade-in zoom-in-95 slide-in-from-top-2 fixed top-[18vh] left-1/2 z-50 flex w-[600px] max-w-[calc(100vw-32px)] -translate-x-1/2 animate-in flex-col overflow-hidden rounded-[12px] border border-border bg-popover shadow-2xl duration-150"
				onKeyDown={(e) => {
					if (e.key === "Escape") {
						e.preventDefault();
						close();
					}
					// ⌘1-4 pick the mode.
					if (e.metaKey && ["1", "2", "3", "4"].includes(e.key)) {
						const picked = MODES[Number(e.key) - 1];
						if (picked) {
							e.preventDefault();
							e.stopPropagation();
							useNewWorkspaceDialog.setState({ mode: picked.id });
						}
					}
					// ⌥← / ⌥→ walk the repos without touching the mouse.
					if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
						e.preventDefault();
						switchRepo(e.key === "ArrowLeft" ? -1 : 1);
					}
				}}
			>
				{/* Mode: how the agent should go at it. ⌘1-4 from the prompt. */}
				<div className="flex items-center gap-1 px-4 pt-3">
					{MODES.map((m, i) => (
						<button
							key={m.id}
							type="button"
							title={`${m.hint} (⌘${i + 1})`}
							onClick={() => useNewWorkspaceDialog.setState({ mode: m.id })}
							className={cn(
								"rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
								m.id === mode
									? "bg-foreground text-background"
									: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
							)}
						>
							{m.label}
						</button>
					))}
					<span className="ml-2 truncate text-[11px] text-faint-foreground">
						{MODES.find((m) => m.id === mode)?.hint}
					</span>
				</div>
				{/* Repo chips: the few you keep, one click (or ⌥←→) apart. */}
				<div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 pt-3 pb-2.5">
					{projects.map((p) => (
						<button
							key={p.id}
							type="button"
							title={p.mainRepoPath}
							onClick={() => {
								setProject(p);
								setBranchEdit(null);
							}}
							className={cn(
								"rounded-full px-2 py-1 text-[12px] font-medium transition-colors",
								p.id === project.id
									? BUTTON.selected
									: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
							)}
						>
							{p.name}
						</button>
					))}
				</div>

				<textarea
					ref={textarea}
					// biome-ignore lint/a11y/noAutofocus: the box exists to be typed in
					autoFocus
					rows={3}
					value={prompt}
					onChange={(e) => setDraft(project.id, e.target.value)}
					onKeyDown={(e) => {
						if (
							e.key === "Enter" &&
							!e.shiftKey &&
							!e.nativeEvent.isComposing
						) {
							e.preventDefault();
							submit();
						}
					}}
					onPaste={async (e) => {
						const files = [...e.clipboardData.files].filter((f) =>
							f.type.startsWith("image/"),
						);
						if (files.length === 0) return;
						e.preventDefault();
						const read = await Promise.all(files.map(readImage));
						setImages((current) => [...current, ...read]);
					}}
					placeholder={`What should the agent do in ${project.name}?`}
					className="min-h-[84px] resize-none bg-transparent px-4 py-3.5 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-faint-foreground"
				/>

				{images.length > 0 && (
					<div className="flex flex-wrap gap-1.5 px-4 pb-2">
						{images.map((image, i) => (
							<span
								key={`${image.name}-${i}`}
								className="flex items-center gap-1 rounded-[12px] bg-secondary py-0.5 pr-1 pl-2 text-[11px] text-soft-foreground"
							>
								{image.name || "image"}
								<button
									type="button"
									aria-label="Remove image"
									onClick={() =>
										setImages((current) => current.filter((_, j) => j !== i))
									}
									className="rounded-[4px] p-0.5 hover:bg-accent"
								>
									<HiOutlineXMark className="size-3" />
								</button>
							</span>
						))}
					</div>
				)}

				{/* The branch it'll make, from where - live, and renamable. */}
				<div className="flex items-center gap-2 px-4 pb-3 text-[12px] text-muted-foreground">
					<LuGitBranch className="size-3.5 shrink-0 text-faint-foreground" />
					{branchEdit !== null ? (
						<input
							// biome-ignore lint/a11y/noAutofocus: opened by a click on the name
							autoFocus
							value={branchEdit}
							onChange={(e) => setBranchEdit(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									textarea.current?.focus();
								}
							}}
							aria-label="Branch name"
							className="min-w-0 flex-1 rounded-[4px] bg-secondary px-1.5 py-0.5 font-mono text-[12px] text-foreground outline-none"
						/>
					) : (
						<button
							type="button"
							title="Rename the branch"
							onClick={() => setBranchEdit(branch)}
							className="min-w-0 truncate rounded-[4px] px-1 py-0.5 font-mono text-soft-foreground hover:bg-accent/60 hover:text-foreground"
						>
							{branch || "a fresh branch"}
						</button>
					)}
					<span className="shrink-0 text-faint-foreground">
						from {baseBranch}
					</span>
				</div>

				<div className="flex items-center gap-3 border-t border-border bg-tertiary px-4 py-2.5 text-[11px] text-faint-foreground">
					<span>
						<kbd className="font-sans text-muted-foreground">↵</kbd> create
					</span>
					<span>
						<kbd className="font-sans text-muted-foreground">⇧↵</kbd> new line
					</span>
					{projects.length > 1 && (
						<span>
							<kbd className="font-sans text-muted-foreground">⌥←→</kbd> repo
						</span>
					)}
					<span>
						<kbd className="font-sans text-muted-foreground">esc</kbd> close
					</span>
					<button
						type="button"
						onClick={submit}
						className={cn(
							"ml-auto rounded-full px-3 py-1.5 text-[12px] font-semibold",
							BUTTON.primary,
						)}
					>
						{prompt.trim() || images.length > 0
							? "Create workspace"
							: "Create empty workspace"}
					</button>
				</div>
			</div>
		</>
	);
}
