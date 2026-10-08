/**
 * Every coloured pill's colours, in one place, keyed by what the colour
 * means - not by hue - so a pill can't pick a colour for looks. Flat: a
 * soft tint of the hue with its light ink as the label - no gradients, no
 * glow. The hues are the tokens in globals.css.
 *
 * Classes only: size, padding and weight stay with each pill.
 */
export const PILL = {
	/** Odin's own doing - Night Agent, auto-started, automations, merged. */
	brand: "bg-primary/15 text-primary-ink",
	/** In flight - a running agent, a live session. */
	working: "bg-working/15 text-working-ink",
	/** Waiting on you, or about to be a problem. */
	attention: "bg-attention/15 text-attention-ink",
	/** Finished, open, passing. */
	success: "bg-success/15 text-success-ink",
	/** Failed, high priority, over a limit. */
	danger: "bg-danger/15 text-danger-ink",
	/** Louder than danger: overdue is the one that has to win the row. */
	alarm: "bg-danger text-white",
	/** A fact, not a flag. */
	neutral: "bg-secondary text-soft-foreground ring-1 ring-inset ring-border",
} as const;

/**
 * Button colours, the same way. A view gets one primary - the thing it exists
 * for - solid accent red, flat - and everything else is secondary, so the
 * accent means "the next click" wherever you are. Done keeps its green: it's the one
 * action that is also a status. `selected` is the on-state of any tab, nav
 * item or toggle.
 */
export const BUTTON = {
	primary: "bg-primary text-primary-foreground hover:brightness-110",
	secondary:
		"bg-secondary text-soft-foreground ring-1 ring-inset ring-border hover:bg-accent hover:text-foreground",
	done: "bg-success/15 text-success-ink ring-1 ring-inset ring-success/25 hover:bg-success/25",
	remind:
		"bg-attention/15 text-attention-ink ring-1 ring-inset ring-attention/25 hover:bg-attention/25",
	selected: "bg-primary/12 text-primary-ink ring-1 ring-inset ring-primary/25",
} as const;

/**
 * A row's actions wait for the row: hidden until you hover it or tab into
 * it, so a list of eight items reads as eight items, not eight blue buttons
 * and eight green ones. Only inside a row (`.group`) - a details panel or a
 * header keeps them visible.
 */
export const ROW_REVEAL =
	"transition-opacity in-[.group]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100";
