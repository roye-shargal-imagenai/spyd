/**
 * spyd's spider, drawn inline so it takes the text colour - the same mark as
 * the app icon (white legs, an hourglass in the accent blue), sized by className.
 */
export function SpiderMark({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 64 64"
			aria-hidden="true"
			className={className}
			fill="none"
			stroke="currentColor"
			strokeWidth={3.2}
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M32 2v12" strokeWidth={1.6} />
			{/* legs: right side, mirrored on the left */}
			<path d="M35 33l9-8 5 6M35 35l11-3 5 6M35 37l10 4 4 8M34 39l6 8 3 7" />
			<path d="M29 33l-9-8-5 6M29 35l-11-3-5 6M29 37l-10 4-4 8M30 39l-6 8-3 7" />
			<ellipse
				cx="32"
				cy="24"
				rx="6.5"
				ry="8.5"
				fill="currentColor"
				stroke="none"
			/>
			<circle cx="32" cy="37" r="4.2" fill="currentColor" stroke="none" />
			<path
				d="M30 20.5h4l-2 3zM32 24.5l-2 3h4z"
				fill="var(--primary)"
				stroke="none"
			/>
		</svg>
	);
}

/**
 * A corner of web, for the empty top-right of a page. Barely there - it's
 * texture, not content - and pointer-transparent.
 */
export function WebCorner({ className }: { className?: string }) {
	const rings = [40, 80, 125, 175, 230];
	const spokes = [0, 15, 32, 50, 68, 85];
	const point = (r: number, deg: number) => {
		const a = (deg * Math.PI) / 180;
		return `${300 - r * Math.cos(a)},${r * Math.sin(a)}`;
	};
	return (
		<svg
			viewBox="0 0 300 300"
			aria-hidden="true"
			className={className}
			fill="none"
			stroke="currentColor"
			strokeWidth={1}
		>
			{spokes.map((deg) => (
				<path key={deg} d={`M300,0 L${point(300, deg)}`} />
			))}
			{rings.map((r) => (
				<path key={r} d={`M${spokes.map((deg) => point(r, deg)).join(" L")}`} />
			))}
		</svg>
	);
}
