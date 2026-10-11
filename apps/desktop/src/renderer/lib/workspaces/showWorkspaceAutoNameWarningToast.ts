import { toast } from "@odin/ui/sonner";

export function showWorkspaceAutoNameWarningToast({
	description,
	onOpenModelAuthSettings,
}: {
	description: string;
	onOpenModelAuthSettings: () => void;
}) {
	// Odin fork: the prompt-based title is a fine name, and the model sign-in
	// it points at is the built-in chat's, which sessions don't use - so the
	// fallback isn't worth a toast on every new workspace.
	if (description.startsWith("A prompt-based title was used")) return;
	toast.warning("Workspace used a fallback name", {
		description,
		// Give users time to read the warning and click through to settings.
		duration: 15_000,
		action: {
			label: "Open Models",
			onClick: onOpenModelAuthSettings,
		},
	});
}
