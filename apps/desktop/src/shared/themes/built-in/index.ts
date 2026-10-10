import type { Theme } from "../types";
import {
	crimsonTheme,
	darkTheme,
	emberTheme,
	forestTheme,
	inkTheme,
	midnightTheme,
} from "./ember";
import { lightTheme, paperTheme } from "./light";
import { monokaiTheme } from "./monokai";
/**
 * All built-in themes
 */
export const builtInThemes: Theme[] = [
	inkTheme,
	paperTheme,
	darkTheme,
	emberTheme,
	midnightTheme,
	crimsonTheme,
	forestTheme,
	lightTheme,
	monokaiTheme,
];

/**
 * Default theme ID
 */
export const DEFAULT_THEME_ID = "spyd-ink";

/**
 * Get a built-in theme by ID
 */
export function getBuiltInTheme(id: string): Theme | undefined {
	return builtInThemes.find((theme) => theme.id === id);
}

// Re-export individual themes
export {
	inkTheme,
	paperTheme,
	crimsonTheme,
	darkTheme,
	emberTheme,
	forestTheme,
	lightTheme,
	midnightTheme,
	monokaiTheme,
};
