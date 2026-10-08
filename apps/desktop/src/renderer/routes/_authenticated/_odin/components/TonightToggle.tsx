import { cn } from "@odin/ui/utils";
import { HiMoon, HiOutlineMoon } from "react-icons/hi2";
import { useOdinTasks } from "../hooks/useOdinTasks";
import { ROW_REVEAL } from "./pill";

/**
 * Mark a row for tonight: the Night Agent starts it before anything it would
 * pick itself. Waits for the row's hover like its other actions, and stays
 * visible once set, so a glance down the list shows what's queued.
 */
export function TonightToggle({
	itemKey,
	className,
}: {
	itemKey: string;
	className?: string;
}) {
	const on = useOdinTasks((s) => (s.tonight ?? []).includes(itemKey));
	const Icon = on ? HiMoon : HiOutlineMoon;
	return (
		<button
			type="button"
			aria-pressed={on}
			title={
				on
					? "Queued for the Night Agent tonight - click to take it off"
					: "Run tonight - the Night Agent starts it first"
			}
			onClick={() => useOdinTasks.getState().setTonight(itemKey, !on)}
			className={cn(
				"flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-semibold transition-colors",
				on
					? "bg-primary/15 text-primary-ink"
					: cn(
							"text-faint-foreground hover:bg-accent/60 hover:text-foreground",
							ROW_REVEAL,
						),
				className,
			)}
		>
			<Icon className="size-3.5" aria-hidden />
			{on && "Tonight"}
		</button>
	);
}
