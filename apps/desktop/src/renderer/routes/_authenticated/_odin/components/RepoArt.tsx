import { cn } from "@odin/ui/utils";
import type { CSSProperties } from "react";

/**
 * Every repo wears one colour, everywhere it appears - the way an album keeps
 * its cover. Picked from the name, so it never changes and needs no setting.
 * Vivid, and never red: red is for errors.
 */
const ART = [
	"#335cf5", // blue
	"#1db954", // green
	"#ff6437", // orange
	"#8d67ff", // violet
	"#0fb9d9", // cyan
	"#f5a524", // amber
	"#f037a5", // pink
	"#27b08a", // teal
	"#509bf5", // sky
	"#9bc53d", // lime
];

export function repoColor(name: string): string {
	let hash = 5381;
	for (const char of name.toLowerCase())
		hash = ((hash << 5) + hash + char.charCodeAt(0)) | 0;
	return ART[Math.abs(hash) % ART.length] as string;
}

/** The repo's cover: its colour, a little depth, and its initial. */
export function RepoArt({
	name,
	size = 20,
	className,
}: {
	name: string;
	size?: number;
	className?: string;
}) {
	const color = repoColor(name);
	return (
		<span
			aria-hidden="true"
			className={cn(
				"inline-flex shrink-0 items-center justify-center font-display font-bold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]",
				className,
			)}
			style={
				{
					width: size,
					height: size,
					borderRadius: Math.max(4, Math.round(size * 0.24)),
					fontSize: Math.round(size * 0.5),
					background: `linear-gradient(140deg, ${color}, color-mix(in oklab, ${color} 55%, black))`,
				} as CSSProperties
			}
		>
			{name
				.replace(/[^a-z0-9]/gi, "")
				.charAt(0)
				.toUpperCase() || "·"}
		</span>
	);
}
