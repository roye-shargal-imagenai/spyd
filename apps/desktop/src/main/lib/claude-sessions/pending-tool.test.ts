import { describe, expect, test } from "bun:test";
import { pendingToolOf } from "./claude-sessions";

const line = (content: unknown[]) =>
	JSON.stringify({ type: "assistant", message: { content } });

describe("pendingToolOf", () => {
	test("returns the last tool call that has no result", () => {
		const jsonl = [
			line([{ type: "tool_use", id: "a", name: "Read", input: { file: "x" } }]),
			line([{ type: "tool_result", tool_use_id: "a" }]),
			line([
				{ type: "text", text: "running tests" },
				{
					type: "tool_use",
					id: "b",
					name: "Bash",
					input: { command: "npm test" },
				},
			]),
		].join("\n");
		expect(pendingToolOf(jsonl)).toEqual({
			name: "Bash",
			input: { command: "npm test" },
		});
	});

	test("is null once the last call has its result", () => {
		const jsonl = [
			line([{ type: "tool_use", id: "a", name: "Bash", input: {} }]),
			line([{ type: "tool_result", tool_use_id: "a" }]),
		].join("\n");
		expect(pendingToolOf(jsonl)).toBeNull();
	});

	test("skips lines that aren't JSON", () => {
		expect(pendingToolOf("not json\n")).toBeNull();
	});
});
