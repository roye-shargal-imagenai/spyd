import { BUTTON, ROW_REVEAL } from "./pill";

/**
 * Per-row Done, the same green pill on every feed and always visible: it's the
 * other half of what a queue row is for. Undo is on the toast, in All tasks'
 * Done list, and - on Reactions - this same button with `done` set.
 */
export function DoneButton({
	onClick,
	done = false,
	disabled,
}: {
	onClick: () => void;
	done?: boolean;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			title={done ? "Move back to the queue" : "Mark done"}
			className={`${ROW_REVEAL} shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-40 ${BUTTON.done}`}
		>
			{done ? "↺ Undo" : "✓ Done"}
		</button>
	);
}
