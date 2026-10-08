/**
 * How a new workspace's agent should approach the work - Roo Code's personas,
 * as a brief on top of your prompt. Build is just your prompt.
 */
export type WorkspaceMode = "build" | "plan" | "debug" | "review";

export const MODES: {
	id: WorkspaceMode;
	label: string;
	hint: string;
	brief: string;
}[] = [
	{
		id: "build",
		label: "Build",
		hint: "Do the work",
		brief: "",
	},
	{
		id: "plan",
		label: "Plan",
		hint: "A plan to approve, no code yet",
		brief:
			"Plan only - don't edit any files yet. Read what you need, then write a short plan: the goal, the steps, the files you'd touch, and the risks. Stop there and wait for my go-ahead.",
	},
	{
		id: "debug",
		label: "Debug",
		hint: "Root cause first, then the fix",
		brief:
			"Debug this properly: reproduce it first, then find the root cause with evidence (logs, a failing test, the exact line). Only then fix it, and add a test that would have caught it.",
	},
	{
		id: "review",
		label: "Review",
		hint: "Read and report, change nothing",
		brief:
			"Review only - don't change any code. Read the diff against the base branch and report what's wrong, most severe first, each with file:line and a suggested fix.",
	},
];

/** The prompt the agent gets: the mode's brief, then what you typed. */
export function withMode(mode: WorkspaceMode, prompt: string): string {
	const brief = MODES.find((m) => m.id === mode)?.brief ?? "";
	const text = prompt.trim();
	if (!brief) return text;
	return text ? `${brief}\n\n${text}` : brief;
}
