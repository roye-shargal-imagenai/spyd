import { electronTrpc } from "renderer/lib/electron-trpc";
import { usePaneMeta } from "./usePaneMeta";
import type { SessionEntry } from "./useSessionSections";

/** The first sentence of a message, as one quiet line. */
function firstLine(text: string): string {
	const plain = text
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/[#*_`>|]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	const sentence = plain.match(/^.{12,}?[.!?](?=\s|$)/)?.[0] ?? plain;
	return sentence.length > 140 ? `${sentence.slice(0, 139)}…` : sentence;
}

/**
 * A one-line summary under a session's name: what Claude said last, read
 * from the transcript on this Mac - no model call, so every row can have one.
 * Before anything's been said, the ask it was started with.
 */
export function useSessionGist(entry: SessionEntry): string {
	const mirrored = usePaneMeta((s) => s.sessionIdByPane[entry.pane.id]);
	const brief = usePaneMeta((s) => s.briefByPane[entry.pane.id]);
	const sessionId = entry.pane.claudeSessionId ?? mirrored ?? null;
	const { data } = electronTrpc.terminal.readClaudeTranscript.useQuery(
		{ sessionId: sessionId ?? "" },
		{
			enabled: !!sessionId,
			retry: false,
			staleTime: 30_000,
			refetchInterval: entry.column === "working" ? 30_000 : false,
		},
	);
	const last = data?.messages.findLast((m) => m.role === "assistant");
	if (last?.text) return firstLine(last.text);
	const asked = data?.prompt ?? brief ?? entry.pane.odinTaskTitle;
	if (asked && asked !== entry.title) return firstLine(asked);
	return "";
}
