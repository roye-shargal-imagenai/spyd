import type { Theme } from "../types";

/**
 * spyd's dark themes: neutral greys with no tint (Spotify's ladder), a
 * darker sidebar, and a single vivid accent.
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
			background: "#1f1f1f",
			foreground: "#f2f2f2",
			card: "#282828",
			cardForeground: "#f2f2f2",
			popover: "#2e2e2e",
			popoverForeground: "#f2f2f2",

			primary: accent,
			primaryForeground: accentForeground,

			// The raised neutral every quiet button and chip sits on.
			secondary: "#313131",
			secondaryForeground: "#f2f2f2",
			muted: "#313131",
			mutedForeground: "#b3b3b3",
			// Hover fill for rows and menu items.
			accent: "#393939",
			accentForeground: "#f2f2f2",

			// Sidebar and top bar: a step under the page.
			tertiary: "#171717",
			tertiaryActive: "#313131",

			destructive: "#ff7d92",
			destructiveForeground: "#fff1f3",

			// Borders are barely there - spacing does the separating.
			border: "#363636",
			input: "#424242",
			ring: accent,

			sidebar: "#171717",
			sidebarForeground: "#f2f2f2",
			sidebarPrimary: accent,
			sidebarPrimaryForeground: accentForeground,
			sidebarAccent: "#313131",
			sidebarAccentForeground: "#f2f2f2",
			sidebarBorder: "#363636",
			sidebarRing: accent,

			chart1: accent,
			chart2: "#2dd4bf",
			chart3: "#1ed760",
			chart4: "#ffb020",
			chart5: "#ff7d92",

			highlightMatch: `rgba(${selection}, 0.2)`,
			highlightActive: `rgba(${selection}, 0.45)`,
			highlight: accent,
			highlightForeground: accentForeground,
		},

		terminal: {
			background: "#1f1f1f",
			foreground: "#f2f2f2",
			cursor: accent,
			cursorAccent: "#1f1f1f",
			selectionBackground: `rgba(${selection}, 0.28)`,

			black: "#282828",
			red: "#ff7d92",
			green: "#1ed760",
			yellow: "#ffb020",
			blue: "#6f9bff",
			magenta: "#c49bff",
			cyan: "#5fd4d9",
			white: "#f2f2f2",

			brightBlack: "#8a8a8a",
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

/** The default: a vivid Spider-Man blue on Spotify-neutral greys - red is for errors. */
export const darkTheme = spydDark({
	id: "dark",
	name: "Spider",
	accent: "#335cf5",
	accentForeground: "#ffffff",
	selection: "51, 92, 245",
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
