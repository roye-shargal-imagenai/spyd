import { toast } from "@odin/ui/sonner";
import { cn } from "@odin/ui/utils";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { PlanCard, QuestionCard } from "../board/ChatPrompts";
import { BUTTON } from "./pill";

/** One line for what the agent wants to do - the part you'd decide on. */
export function describeTool(
	name: string,
	input: Record<string, unknown>,
): {
	verb: string;
	detail: string;
} {
	const str = (key: string) =>
		typeof input[key] === "string" ? (input[key] as string) : "";
	switch (name) {
		case "Bash":
			return { verb: "Run", detail: str("command") };
		case "Edit":
		case "MultiEdit":
			return { verb: "Edit", detail: str("file_path") };
		case "Write":
			return { verb: "Write", detail: str("file_path") };
		case "WebFetch":
			return { verb: "Fetch", detail: str("url") };
		case "WebSearch":
			return { verb: "Search the web for", detail: str("query") };
		default:
			return { verb: "Use", detail: name };
	}
}

/**
 * Answer a waiting session where you are - Home, not its drawer. Reads the
 * tool call it's stuck on from the transcript and offers the answer Claude
 * Code's own menu would take: 1 allows, 2 allows from now on, Esc denies.
 * A question or a plan gets the chat view's own cards.
 */
export function InlineAsk({
	paneId,
	sessionId,
	toolsOnly = false,
}: {
	paneId: string;
	sessionId: string;
	/** Leave questions and plans to a chat view already showing its own cards. */
	toolsOnly?: boolean;
}) {
	const utils = electronTrpc.useUtils();
	const { data: tool } = electronTrpc.terminal.pendingTool.useQuery(
		{ sessionId },
		{ refetchInterval: 3_000, retry: false },
	);
	const write = electronTrpc.terminal.write.useMutation();

	const send = async (keys: string[], label: string) => {
		try {
			for (const key of keys) {
				await write.mutateAsync({ paneId, data: key });
				await new Promise((resolve) => setTimeout(resolve, 250));
			}
			toast.success(label);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
		for (const ms of [500, 2000])
			setTimeout(() => void utils.terminal.pendingTool.invalidate(), ms);
	};

	if (!tool) return null;
	if (
		toolsOnly &&
		(tool.name === "AskUserQuestion" || tool.name === "ExitPlanMode")
	)
		return null;
	if (tool.name === "AskUserQuestion")
		return (
			<QuestionCard
				input={tool.input}
				onKeys={(keys) => void send(keys, "Answered")}
			/>
		);
	if (tool.name === "ExitPlanMode")
		return (
			<PlanCard input={tool.input} onKeys={(keys) => void send(keys, "Sent")} />
		);

	const { verb, detail } = describeTool(tool.name, tool.input);
	return (
		<div className="flex flex-col gap-2 rounded-[12px] border border-border bg-background/50 px-3 py-2.5">
			<div className="text-[11px] font-semibold uppercase tracking-wide text-faint-foreground">
				Wants to {verb.toLowerCase()}
			</div>
			<code className="line-clamp-3 cursor-text select-text whitespace-pre-wrap break-all font-mono text-[12px] text-soft-foreground">
				{detail}
			</code>
			<div className="flex flex-wrap gap-1.5 pt-0.5">
				<button
					type="button"
					onClick={() => void send(["1"], "Allowed")}
					className={cn(
						"rounded-full px-2.5 py-1 text-[12px] font-semibold",
						BUTTON.primary,
					)}
				>
					Allow
				</button>
				<button
					type="button"
					title="Allow this and don't ask again for the same thing in this session"
					onClick={() => void send(["2"], "Allowed from now on")}
					className={cn(
						"rounded-full px-2.5 py-1 text-[12px] font-semibold",
						BUTTON.secondary,
					)}
				>
					Always allow
				</button>
				<button
					type="button"
					onClick={() => void send(["\x1b"], "Denied")}
					className="rounded-full px-2.5 py-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
				>
					Deny
				</button>
			</div>
		</div>
	);
}
