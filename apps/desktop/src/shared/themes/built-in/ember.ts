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
/** The surface ladder a theme sits on: page, raised, chrome, lines, text. */
type Surface = {
	page: string;
	card: string;
	popover: string;
	raised: string;
	hover: string;
	chrome: string;
	border: string;
	input: string;
	text: string;
	muted: string;
	faint: string;
};

/** Spotify's neutral greys. */
const GREY: Surface = {
	page: "#1f1f1f",
	card: "#282828",
	popover: "#2e2e2e",
	raised: "#313131",
	hover: "#393939",
	chrome: "#171717",
	border: "#363636",
	input: "#424242",
	text: "#f2f2f2",
	muted: "#b3b3b3",
	faint: "#8a8a8a",
};

/** The suit at night: deep navy panes floating on a near-black window. */
export const WEB: Surface = {
	page: "#0f1630",
	card: "#15203f",
	popover: "#15203f",
	raised: "#22305c",
	hover: "#1c2a52",
	chrome: "#070b17",
	border: "#1c2a52",
	input: "#2a3a6b",
	text: "#f3f5fb",
	muted: "#a9b3cf",
	faint: "#8590b3",
};

/**
 * Graphite: dark without being black, panels a shade apart, hairline edges
 * and soft white text - a professional tool's quiet, not a toy's contrast.
 */
export const INK: Surface = {
	page: "#1d1d21",
	card: "#24242a",
	popover: "#27272d",
	raised: "#2a2a30",
	hover: "#2e2e35",
	chrome: "#161619",
	border: "#2c2c33",
	input: "#3d3d46",
	text: "#ececef",
	muted: "#a3a3ad",
	faint: "#80808b",
};

/**
 * Superset's own Dark, token for token: warm near-black, the sidebar a step
 * up, borders and fills one shared warm grey.
 */
export const CHARCOAL: Surface = {
	page: "#151110",
	card: "#201e1c",
	popover: "#201e1c",
	raised: "#2a2827",
	hover: "#252220",
	chrome: "#1a1716",
	border: "#2a2827",
	input: "#2a2827",
	text: "#eae8e6",
	muted: "#a8a5a3",
	faint: "#7f7b78",
};

/**
 * macOS dark, from Apple's own system greys: content on gray6, the sidebar a
 * step lighter the way a vibrant Mac sidebar reads, separators and fills
 * from the same ladder. Grey, not black.
 */
export const MAC: Surface = {
	page: "#1c1c1e",
	card: "#2c2c2e",
	popover: "#2c2c2e",
	raised: "#3a3a3c",
	hover: "#2c2c2e",
	chrome: "#252527",
	border: "#38383a",
	input: "#3a3a3c",
	text: "#f5f5f7",
	muted: "#aeaeb2",
	faint: "#8e8e93",
};

function spydDark({
	id,
	name,
	accent,
	accentForeground,
	selection,
	surface = GREY,
	button,
}: {
	id: string;
	name: string;
	surface?: Surface;
	/**
	 * The primary button, when it isn't the accent. Superset's is plain
	 * foreground-on-page, so the accent is left to mark selection and state.
	 */
	button?: { background: string; foreground: string; ring: string };
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
			background: surface.page,
			foreground: surface.text,
			card: surface.card,
			cardForeground: surface.text,
			popover: surface.popover,
			popoverForeground: surface.text,

			primary: button?.background ?? accent,
			primaryForeground: button?.foreground ?? accentForeground,

			// The raised neutral every quiet button and chip sits on.
			secondary: surface.raised,
			secondaryForeground: surface.text,
			muted: surface.raised,
			mutedForeground: surface.muted,
			// Hover fill for rows and menu items.
			accent: surface.hover,
			accentForeground: surface.text,

			// Sidebar and top bar: a step under the page.
			tertiary: surface.chrome,
			tertiaryActive: surface.raised,

			destructive: "#ff7d92",
			destructiveForeground: "#fff1f3",

			// Borders are barely there - spacing does the separating.
			border: surface.border,
			input: surface.input,
			ring: button?.ring ?? accent,

			sidebar: surface.chrome,
			sidebarForeground: surface.text,
			sidebarPrimary: accent,
			sidebarPrimaryForeground: accentForeground,
			sidebarAccent: surface.raised,
			sidebarAccentForeground: surface.text,
			sidebarBorder: surface.border,
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
			background: surface.page,
			foreground: surface.text,
			cursor: accent,
			cursorAccent: surface.page,
			selectionBackground: `rgba(${selection}, 0.28)`,

			black: surface.card,
			red: "#ff7d92",
			green: "#1ed760",
			yellow: "#ffb020",
			blue: "#6f9bff",
			magenta: "#c49bff",
			cyan: "#5fd4d9",
			white: surface.text,

			brightBlack: surface.faint,
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

/**
 * The default: macOS dark - Apple's system greys and blue, light-on-dark
 * buttons like Superset's.
 */
export const inkTheme = spydDark({
	id: "spyd-ink",
	name: "Mac",
	surface: MAC,
	accent: "#0a84ff",
	accentForeground: "#ffffff",
	selection: "10, 132, 255",
	button: { background: "#f5f5f7", foreground: "#1c1c1e", ring: "#48484a" },
});

/** Superset's own Dark, warm charcoal, for when you want it near-black. */
export const charcoalTheme = spydDark({
	id: "spyd-charcoal",
	name: "Charcoal",
	surface: CHARCOAL,
	accent: "#0a84ff",
	accentForeground: "#ffffff",
	selection: "10, 132, 255",
	button: { background: "#eae8e6", foreground: "#151110", ring: "#3a3837" },
});

/** The previous default: cool graphite with a blue primary button. */
export const graphiteTheme = spydDark({
	id: "spyd-graphite",
	name: "Graphite",
	surface: INK,
	accent: "#5470f0",
	accentForeground: "#ffffff",
	selection: "84, 112, 240",
});

export const darkTheme = spydDark({
	id: "dark",
	name: "Spider",
	surface: WEB,
	accent: "#e8303f",
	accentForeground: "#ffffff",
	selection: "232, 48, 63",
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
