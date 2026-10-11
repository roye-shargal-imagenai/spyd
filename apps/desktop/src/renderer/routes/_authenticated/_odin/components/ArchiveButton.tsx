import { cn } from "@odin/ui/utils";
import { HiXMark } from "react-icons/hi2";
import { useArchiveSession } from "../hooks/useDone";

/**
 * X that ends a session and sends it to the Archive, with Undo. It shows only
 * after the pointer has rested on the row a moment - and can't be clicked
 * before then - so a click meant to open the row never lands on it.
 */
export function ArchiveButton({
	paneId,
	title,
	className,
}: {
	paneId: string;
	title: string;
	className?: string;
}) {
	const archive = useArchiveSession();
	return (
		<button
			type="button"
			aria-label={`Archive ${title}`}
			title="Archive - end the session. The Archive can resume it."
			onClick={(event) => {
				event.stopPropagation();
				archive(paneId, title);
			}}
			className={cn(
				"invisible flex size-[18px] items-center justify-center rounded-[5px] text-faint-foreground opacity-0 transition-[visibility,opacity,color,background-color] delay-0 hover:bg-white/[0.08] hover:text-foreground focus-visible:visible focus-visible:opacity-100 group-hover/row:visible group-hover/row:opacity-100 group-hover/row:delay-500",
				className,
			)}
		>
			<HiXMark className="size-3.5" strokeWidth={0.6} />
		</button>
	);
}
