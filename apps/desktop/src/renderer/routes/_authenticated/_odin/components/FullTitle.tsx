import { Tooltip, TooltipContent, TooltipTrigger } from "@odin/ui/tooltip";
import { type ReactElement, useState } from "react";

/**
 * A one-line title that shows the rest of itself on hover - only when the
 * line actually cut it off, so a short title never grows a pointless card.
 * Wraps the element that truncates (it must be the trigger's only child).
 */
export function FullTitle({
	text,
	detail,
	children,
}: {
	/** The whole title, as the card shows it. */
	text: string;
	/** A quieter second line - a ticket key, a repo. */
	detail?: string | null;
	children: ReactElement;
}) {
	const [open, setOpen] = useState(false);
	return (
		<Tooltip
			open={open}
			onOpenChange={(next) => {
				if (!next) return setOpen(false);
			}}
			delayDuration={250}
		>
			<TooltipTrigger
				asChild
				onPointerEnter={(event) => {
					const el = event.currentTarget as HTMLElement;
					if (
						el.scrollWidth > el.clientWidth + 1 ||
						el.scrollHeight > el.clientHeight + 1
					)
						setOpen(true);
				}}
				onPointerLeave={() => setOpen(false)}
			>
				{children}
			</TooltipTrigger>
			<TooltipContent
				side="bottom"
				align="start"
				sideOffset={6}
				className="max-w-[460px] rounded-lg px-3.5 py-2.5"
			>
				<div className="flex flex-col gap-1">
					<span className="text-[13px] font-semibold leading-snug">{text}</span>
					{detail && <span className="text-[11.5px] opacity-70">{detail}</span>}
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
