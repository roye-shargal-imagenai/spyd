import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "@odin/ui/command";
import { toast } from "@odin/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
	HiOutlineArrowDownTray,
	HiOutlineArrowRight,
	HiOutlineFolderPlus,
	HiOutlineMoon,
	HiOutlinePlus,
} from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { create } from "zustand";
import { useOdinProfile } from "../hooks/useOdinProfile";
import { useOdinTasks } from "../hooks/useOdinTasks";
import { useStartWorkspace } from "../hooks/useStartWorkspace";
import { useNewWorkspaceDialog } from "./NewWorkspaceDialog";
import { StatusGlyph, useOpenSession, useSidebarSessions } from "./SessionList";
import { useSupersetImport } from "./SupersetImport";

export const useCommandPalette = create<{
	isOpen: boolean;
	setOpen: (isOpen: boolean) => void;
}>((set) => ({
	isOpen: false,
	setOpen: (isOpen) => set({ isOpen }),
}));

/** Every screen, by the name you'd type. */
const PLACES = [
	{ label: "Home", to: "/home" },
	{ label: "Night Agent", to: "/night" },
	{ label: "Dev Board", to: "/board" },
	{ label: "Tasks", to: "/all" },
	{ label: "Review", to: "/review" },
	{ label: "Automations", to: "/automations" },
	{ label: "Insights", to: "/insights" },
	{ label: "Archive (older sessions)", to: "/sessions" },
	{ label: "Night Agent settings", to: "/settings/backlog" },
	{ label: "Appearance", to: "/settings/appearance" },
	{ label: "Settings", to: "/settings" },
] as const;

const ITEM = "gap-2.5 rounded-md px-2.5 py-2";

/**
 * ⌘K: one box for everything - a session by what it's about, a new workspace
 * in any repo, any screen. Enter runs the highlighted line; the shortcut on
 * the right is how to get there without the palette next time.
 */
export function CommandPalette() {
	const isOpen = useCommandPalette((s) => s.isOpen);
	const setOpen = useCommandPalette((s) => s.setOpen);
	const navigate = useNavigate();
	const { sessions } = useSidebarSessions();
	const openSession = useOpenSession();
	const { data: projects = [] } = electronTrpc.projects.getRecents.useQuery(
		undefined,
		{ enabled: isOpen },
	);
	const utils = electronTrpc.useUtils();
	const addRepo = electronTrpc.projects.openNew.useMutation({
		onSuccess: () => void utils.projects.getRecents.invalidate(),
	});
	const { start } = useStartWorkspace();
	const [search, setSearch] = useState("");
	const { activeId } = useOdinProfile();
	const tonightText = search.trim();

	const run = (action: () => void) => {
		setOpen(false);
		action();
	};

	return (
		<CommandDialog
			open={isOpen}
			onOpenChange={setOpen}
			title="Command palette"
			description="Jump to a session, start a workspace, or open a screen"
			showCloseButton={false}
			className="top-[18vh] max-w-[600px] translate-y-0 rounded-md border-border bg-popover sm:max-w-[600px]"
		>
			<CommandInput
				value={search}
				onValueChange={setSearch}
				placeholder="Search, or type a task to run tonight…"
			/>
			<CommandList className="max-h-[420px]">
				<CommandEmpty>Nothing matches.</CommandEmpty>

				{/* Whatever you typed, as a task for the Night Agent - the quickest
				    way to hand it something on the way out. */}
				{tonightText.length > 2 && (
					<CommandGroup heading="Tonight">
						<CommandItem
							value={`tonight night agent ${tonightText}`}
							onSelect={() =>
								run(() => {
									useOdinTasks
										.getState()
										.add(`${tonightText} #tonight`, activeId);
									setSearch("");
									toast.success(
										`Queued for tonight - ${tonightText.slice(0, 50)}`,
									);
								})
							}
							className={ITEM}
						>
							<HiOutlineMoon />
							<span className="min-w-0 flex-1 truncate">
								Run tonight: <span className="font-medium">{tonightText}</span>
							</span>
						</CommandItem>
					</CommandGroup>
				)}

				{sessions.length > 0 && (
					<CommandGroup heading="Sessions">
						{sessions.map((entry, i) => (
							<CommandItem
								key={entry.pane.id}
								value={`session ${entry.title} ${entry.pane.id}`}
								onSelect={() => run(() => openSession(entry.pane.id))}
								className={ITEM}
							>
								<StatusGlyph column={entry.column} />
								<span className="min-w-0 flex-1 truncate">{entry.title}</span>
								{i < 9 && <CommandShortcut>⌘{i + 1}</CommandShortcut>}
							</CommandItem>
						))}
					</CommandGroup>
				)}

				<CommandGroup heading="New workspace">
					{projects.map((project) => (
						<CommandItem
							key={project.id}
							value={`new workspace ${project.name}`}
							onSelect={() =>
								run(() =>
									start({
										project,
										prompt: "",
										images: [],
										branch: "",
										openWhenReady: true,
									}),
								)
							}
							className={ITEM}
						>
							<HiOutlinePlus />
							<span className="flex-1">
								New workspace in{" "}
								<span className="font-medium">{project.name}</span>
							</span>
						</CommandItem>
					))}
					<CommandItem
						value="new workspace with a prompt describe"
						onSelect={() => run(() => useNewWorkspaceDialog.getState().open())}
						className={ITEM}
					>
						<HiOutlinePlus />
						<span className="flex-1">New workspace with a prompt…</span>
						<CommandShortcut>⌘N</CommandShortcut>
					</CommandItem>
					<CommandItem
						value="import from superset workspace resume"
						onSelect={() =>
							run(() => useSupersetImport.getState().setOpen(true))
						}
						className={ITEM}
					>
						<HiOutlineArrowDownTray />
						<span className="flex-1">Import from Superset…</span>
					</CommandItem>
					<CommandItem
						value="add repository folder"
						onSelect={() => run(() => addRepo.mutate())}
						className={ITEM}
					>
						<HiOutlineFolderPlus />
						<span className="flex-1">Add a repository…</span>
					</CommandItem>
				</CommandGroup>

				<CommandGroup heading="Go to">
					{PLACES.map((place) => (
						<CommandItem
							key={place.to}
							value={`go ${place.label}`}
							onSelect={() => run(() => navigate({ to: place.to }))}
							className={ITEM}
						>
							<HiOutlineArrowRight />
							<span className="flex-1">{place.label}</span>
						</CommandItem>
					))}
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
