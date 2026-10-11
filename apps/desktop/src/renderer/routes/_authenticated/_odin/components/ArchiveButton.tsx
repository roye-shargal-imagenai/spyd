import { cn } from "@odin/ui/utils";
import { HiXMark } from "react-icons/hi2";

/** Hover-only X that ends a session and sends it to the Archive. */
export function ArchiveButton({
	title,
	onArchive,
	className,
}: {
	title: string;
	onArchive: () => void;
	className?: string;
}) {
	return (
		<button
			type="button"
			aria-label={`Archive ${title}`}
			title="Archive - end the session. The Archive can resume it."
			onClick={(event) => {
				event.stopPropagation();
				onArchive();
			}}
			className={cn(
				"flex size-[18px] items-center justify-center rounded-[5px] text-faint-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-white/[0.08] hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100",
				className,
			)}
		>
			<HiXMark className="size-3.5" strokeWidth={0.6} />
		</button>
	);
}
