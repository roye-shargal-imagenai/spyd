import type { Theme } from "../types";

/**
 * spyd's dark themes: one near-black, low-border base, and a single accent.
 * The accent is "the next click" - the primary button, the selected row, a
 * session waiting on you - and nothing else, so it never has to compete.
 * The status hues (working, attention, success, danger) live in globals.css
 * and read the same under every accent.
 *
 * The sidebar and top bar (tertiary) sit a step darker than the page, so the
 * chrome recedes and the work leads.
 */
function spydDark({
	id,
	name,
	accent,
	accentForeground,
	selection,
}: {
	id: string;
	name: string;
	accent: string;
	/** Text on a solid accent button - dark on a light accent, white on a deep one. */
	accentForeground: string;
	/** The accent as `r, g, b`, for the translucent search and selection fills. */
	selection: string;
}): Theme {
	return {
		id,
		name,
		author: "spyd",
		type: "dark",
		isBuiltIn: true,

		ui: {
			background: "#202024",
			foreground: "#e8e8ea",
			card: "#27272c",
			cardForeground: "#e8e8ea",
			popover: "#2c2c32",
			popoverForeground: "#e8e8ea",

			primary: accent,
			primaryForeground: accentForeground,

			// The raised neutral every quiet button and chip sits on.
			secondary: "#2f2f35",
			secondaryForeground: "#e8e8ea",
			muted: "#2f2f35",
			mutedForeground: "#a8a8b0",
			// Hover fill for rows and menu items.
			accent: "#37373e",
			accentForeground: "#e8e8ea",

			// Sidebar and top bar: a step under the page.
			tertiary: "#1b1b1f",
			tertiaryActive: "#2f2f35",

			destructive: "#ff7d92",
			destructiveForeground: "#fff1f3",

			// Borders are barely there - spacing does the separating.
			border: "#35353c",
			input: "#40404a",
			ring: accent,

			sidebar: "#1b1b1f",
			sidebarForeground: "#e8e8ea",
			sidebarPrimary: accent,
			sidebarPrimaryForeground: accentForeground,
			sidebarAccent: "#2f2f35",
			sidebarAccentForeground: "#e8e8ea",
			sidebarBorder: "#35353c",
			sidebarRing: accent,

			chart1: accent,
			chart2: "#2dd4bf",
			chart3: "#4ade80",
			chart4: "#f5b83d",
			chart5: "#ff7d92",

			highlightMatch: `rgba(${selection}, 0.2)`,
			highlightActive: `rgba(${selection}, 0.45)`,
			highlight: accent,
			highlightForeground: accentForeground,
		},

		terminal: {
			background: "#202024",
			foreground: "#e8e8ea",
			cursor: accent,
			cursorAccent: "#202024",
			selectionBackground: `rgba(${selection}, 0.28)`,

			black: "#27272c",
			red: "#ff7d92",
			green: "#4ade80",
			yellow: "#f5b83d",
			blue: "#6f9bff",
			magenta: "#c49bff",
			cyan: "#5fd4d9",
			white: "#e8e8ea",

			brightBlack: "#878790",
			brightRed: "#ff8095",
			brightGreen: "#86efac",
			brightYellow: "#ffcd6b",
			brightBlue: "#a5c0ff",
			brightMagenta: "#d6b8ff",
			brightCyan: "#8ee6ea",
			brightWhite: "#ffffff",
		},

		editor: {
			syntax: {
				comment: "#8b8b95",
			},
		},
	};
}

/** The default: Spider-Man's dark blue on graphite - red is for errors. */
export const darkTheme = spydDark({
	id: "dark",
	name: "Spider",
	accent: "#2350c8",
	accentForeground: "#ffffff",
	selection: "35, 80, 200",
});

/** A warm ember accent, dark labels on it. */
export const emberTheme = spydDark({
	id: "spyd-ember",
	name: "Ember",
	accent: "#ff7a45",
	accentForeground: "#1a0b05",
	selection: "255, 122, 69",
});

/** A cool periwinkle blue - the quietest of the set. */
export const midnightTheme = spydDark({
	id: "spyd-midnight",
	name: "Midnight",
	accent: "#7c9cff",
	accentForeground: "#0b1024",
	selection: "124, 156, 255",
});

/** Deep Superman red with white labels. */
export const crimsonTheme = spydDark({
	id: "spyd-crimson",
	name: "Crimson",
	accent: "#c8202e",
	accentForeground: "#ffffff",
	selection: "200, 32, 46",
});

/** A dark emerald with white labels. */
export const forestTheme = spydDark({
	id: "spyd-forest",
	name: "Forest",
	accent: "#1f8f5c",
	accentForeground: "#ffffff",
	selection: "31, 143, 92",
});
