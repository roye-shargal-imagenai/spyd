import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "@odin/ui/command";
import { useNavigate } from "@tanstack/react-router";
import {
	HiOutlineArrowDownTray,
	HiOutlineArrowRight,
	HiOutlineFolderPlus,
	HiOutlinePlus,
} from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { create } from "zustand";
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
	{ label: "Dev Board", to: "/board" },
	{ label: "Tasks", to: "/all" },
	{ label: "Review", to: "/review" },
	{ label: "Automations", to: "/automations" },
	{ label: "Insights", to: "/insights" },
	{ label: "Session History", to: "/sessions" },
	{ label: "Night Agent settings", to: "/settings/backlog" },
	{ label: "Appearance", to: "/settings/appearance" },
	{ label: "Settings", to: "/settings" },
] as const;

const ITEM = "gap-2.5 rounded-[6px] px-2.5 py-2";

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
			className="top-[18vh] max-w-[600px] translate-y-0 rounded-[6px] border-border bg-popover sm:max-w-[600px]"
		>
			<CommandInput placeholder="Search sessions, repositories, screens…" />
			<CommandList className="max-h-[420px]">
				<CommandEmpty>Nothing matches.</CommandEmpty>

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
