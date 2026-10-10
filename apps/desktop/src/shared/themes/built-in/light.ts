import type { Theme } from "../types";

/**
 * Light theme - based on the original Odin light mode colors
 */
export const lightTheme: Theme = {
	id: "light",
	name: "Light",
	author: "Odin",
	type: "light",
	isBuiltIn: true,

	ui: {
		background: "oklch(1 0 0)",
		foreground: "oklch(0.145 0 0)",
		card: "oklch(0.97 0 0)",
		cardForeground: "oklch(0.145 0 0)",
		popover: "oklch(0.97 0 0)",
		popoverForeground: "oklch(0.145 0 0)",
		primary: "oklch(0.205 0 0)",
		primaryForeground: "oklch(0.985 0 0)",
		secondary: "oklch(0.97 0 0)",
		secondaryForeground: "oklch(0.205 0 0)",
		muted: "oklch(0.97 0 0)",
		mutedForeground: "oklch(0.556 0 0)",
		accent: "oklch(0.93 0 0)",
		accentForeground: "oklch(0.205 0 0)",
		tertiary: "oklch(0.95 0.003 40)",
		tertiaryActive: "oklch(0.90 0.003 40)",
		destructive: "oklch(0.577 0.245 27.325)",
		destructiveForeground: "oklch(0.985 0 0)",
		border: "oklch(0.922 0 0)",
		input: "oklch(0.922 0 0)",
		ring: "oklch(0.708 0 0)",
		sidebar: "oklch(0.985 0 0)",
		sidebarForeground: "oklch(0.145 0 0)",
		sidebarPrimary: "oklch(0.205 0 0)",
		sidebarPrimaryForeground: "oklch(0.985 0 0)",
		sidebarAccent: "oklch(0.97 0 0)",
		sidebarAccentForeground: "oklch(0.205 0 0)",
		sidebarBorder: "oklch(0.922 0 0)",
		sidebarRing: "oklch(0.708 0 0)",
		chart1: "oklch(0.646 0.222 41.116)",
		chart2: "oklch(0.6 0.118 184.704)",
		chart3: "oklch(0.398 0.07 227.392)",
		chart4: "oklch(0.828 0.189 84.429)",
		chart5: "oklch(0.769 0.188 70.08)",

		// Search highlights
		highlightMatch: "rgba(255, 211, 61, 0.35)",
		highlightActive: "rgba(255, 150, 50, 0.55)",

		// Brand highlight - warm chart-1 orange
		highlight: "oklch(0.646 0.222 41.116)",
		highlightForeground: "oklch(0.985 0 0)",
	},

	terminal: {
		background: "#ffffff",
		foreground: "#000000",
		cursor: "#000000",
		cursorAccent: "#ffffff",
		selectionBackground: "#add6ff",

		// Standard ANSI colors (xterm defaults)
		black: "#2e3436",
		red: "#cc0000",
		green: "#4e9a06",
		yellow: "#c4a000",
		blue: "#3465a4",
		magenta: "#75507b",
		cyan: "#06989a",
		white: "#d3d7cf",

		// Bright ANSI colors (xterm defaults)
		brightBlack: "#555753",
		brightRed: "#ef2929",
		brightGreen: "#8ae234",
		brightYellow: "#fce94f",
		brightBlue: "#729fcf",
		brightMagenta: "#ad7fa8",
		brightCyan: "#34e2e2",
		brightWhite: "#eeeeec",
	},
};

/**
 * spyd's default: the suit in pastel. A powder-blue window with white panes
 * floating on it, Spider-Man blue for the next click, and colour only where
 * it means something - sky blue working, coral red waiting on you, mint done.
 * Bright and calm enough to read tickets and threads in all day.
 */
export const paperTheme: Theme = {
	id: "spyd-paper",
	name: "Spider pastel",
	author: "spyd",
	type: "light",
	isBuiltIn: true,

	ui: {
		background: "#f8faff",
		foreground: "#1b2340",
		card: "#ffffff",
		cardForeground: "#1b2340",
		popover: "#ffffff",
		popoverForeground: "#1b2340",
		primary: "#2453c9",
		primaryForeground: "#ffffff",
		// Chips and quiet buttons: a breath of warm grey under the text.
		secondary: "#e4ebfa",
		secondaryForeground: "#1b2340",
		muted: "#e4ebfa",
		mutedForeground: "#4a5372",
		// Hover fill for rows and menu items.
		accent: "#dde6f8",
		accentForeground: "#1b2340",
		// The window and the sidebar: warm paper under the white panes.
		tertiary: "#c9d5f0",
		tertiaryActive: "#b7c6ea",
		destructive: "#d6334f",
		destructiveForeground: "#ffffff",
		border: "#d6dff0",
		input: "#bccbe6",
		ring: "#2453c9",
		sidebar: "#c9d5f0",
		sidebarForeground: "#1b2340",
		sidebarPrimary: "#2453c9",
		sidebarPrimaryForeground: "#ffffff",
		sidebarAccent: "#b7c6ea",
		sidebarAccentForeground: "#1b2340",
		sidebarBorder: "#d6dff0",
		sidebarRing: "#2453c9",
		chart1: "#2453c9",
		chart2: "#2f80ed",
		chart3: "#16a34a",
		chart4: "#d97706",
		chart5: "#e11d48",
		highlightMatch: "rgba(36, 83, 201, 0.16)",
		highlightActive: "rgba(36, 83, 201, 0.32)",
		highlight: "#2453c9",
		highlightForeground: "#ffffff",
	},

	terminal: {
		background: "#f8faff",
		foreground: "#1b2340",
		cursor: "#2453c9",
		cursorAccent: "#ffffff",
		selectionBackground: "rgba(36, 83, 201, 0.22)",
		black: "#2e3440",
		red: "#c2334d",
		green: "#2f8f46",
		yellow: "#a86b00",
		blue: "#2453c9",
		magenta: "#8a4fbf",
		cyan: "#0f7f86",
		white: "#c9ccd3",
		brightBlack: "#6b7280",
		brightRed: "#e0435f",
		brightGreen: "#3aa856",
		brightYellow: "#c98500",
		brightBlue: "#5b78e6",
		brightMagenta: "#a46ad6",
		brightCyan: "#17979f",
		brightWhite: "#c9d5f0",
	},
};
