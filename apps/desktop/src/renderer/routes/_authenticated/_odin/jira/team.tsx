import { cn } from "@odin/ui/utils";
import { useState } from "react";
import { HiOutlinePlus, HiXMark } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { personColor } from "../components/PersonChip";

export interface TeamMember {
	accountId: string;
	name: string;
}

/** The people under you, by Jira account. A short list, capped. */
export const useJiraTeam = create<{
	members: TeamMember[];
	add: (member: TeamMember) => void;
	remove: (accountId: string) => void;
}>()(
	persist(
		(set) => ({
			members: [],
			add: (member) =>
				set((s) =>
					s.members.some((m) => m.accountId === member.accountId)
						? s
						: { members: [...s.members, member].slice(-30) },
				),
			remove: (accountId) =>
				set((s) => ({
					members: s.members.filter((m) => m.accountId !== accountId),
				})),
		}),
		{ name: "spyd-jira-team" },
	),
);

/** Pick the team: who's on it, and a search over Jira's people to add more. */
export function TeamPicker({ onDone }: { onDone?: () => void }) {
	const members = useJiraTeam((s) => s.members);
	const { add, remove } = useJiraTeam.getState();
	const [query, setQuery] = useState("");
	const people = electronTrpc.work.jiraPeople.useQuery(
		{ query },
		{ enabled: query.trim().length >= 2, staleTime: 60_000 },
	);
	const results = (people.data ?? []).filter(
		(p) => !members.some((m) => m.accountId === p.accountId),
	);
	return (
		<div className="mx-auto mt-6 flex w-full max-w-[460px] flex-col gap-3 rounded-lg bg-card p-4 ring-1 ring-border">
			<div className="flex items-baseline justify-between">
				<h2 className="text-[14px] font-semibold">Your team</h2>
				{onDone && members.length > 0 && (
					<button
						type="button"
						onClick={onDone}
						className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
					>
						Done
					</button>
				)}
			</div>
			{members.length > 0 ? (
				<div className="flex flex-wrap gap-1.5">
					{members.map((member) => (
						<span
							key={member.accountId}
							className="flex items-center gap-1.5 rounded-md bg-secondary py-0.5 pr-1 pl-1 text-[12px]"
						>
							<Avatar name={member.name} />
							{member.name}
							<button
								type="button"
								aria-label={`Remove ${member.name}`}
								onClick={() => remove(member.accountId)}
								className="flex size-4 items-center justify-center rounded text-faint-foreground hover:bg-white/[0.08] hover:text-foreground"
							>
								<HiXMark className="size-3" />
							</button>
						</span>
					))}
				</div>
			) : (
				<p className="text-[12.5px] text-muted-foreground">
					Add the people under you to see their tickets in one place.
				</p>
			)}
			<input
				// biome-ignore lint/a11y/noAutofocus: the picker opens to add someone
				autoFocus
				value={query}
				onChange={(event) => setQuery(event.target.value)}
				placeholder="Search Jira by name…"
				aria-label="Search Jira people"
				className="h-8 rounded-md bg-input/60 px-2.5 text-[13px] outline-none ring-1 ring-border placeholder:text-faint-foreground focus:ring-ring"
			/>
			{query.trim().length >= 2 && (
				<div className="flex flex-col">
					{people.isFetching && results.length === 0 && (
						<span className="px-1 py-1 text-[12px] text-faint-foreground">
							Searching…
						</span>
					)}
					{!people.isFetching && results.length === 0 && (
						<span className="px-1 py-1 text-[12px] text-faint-foreground">
							No one by that name
						</span>
					)}
					{results.map((person) => (
						<button
							key={person.accountId}
							type="button"
							onClick={() => {
								add({ accountId: person.accountId, name: person.name });
								setQuery("");
							}}
							className="group flex h-8 items-center gap-2 rounded-md px-1.5 text-left text-[13px] hover:bg-accent"
						>
							<Avatar name={person.name} />
							<span className="flex-1 truncate">{person.name}</span>
							<HiOutlinePlus className="size-3.5 text-faint-foreground group-hover:text-foreground" />
						</button>
					))}
				</div>
			)}
		</div>
	);
}

/** Initials in the person's colour - the name is on hover. */
export function Avatar({
	name,
	className,
}: {
	name: string;
	className?: string;
}) {
	const initials = name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("");
	return (
		<span
			title={name}
			className={cn(
				"flex size-5 shrink-0 items-center justify-center rounded-full text-[9.5px] font-semibold text-background",
				className,
			)}
			style={{ backgroundColor: personColor(name).fg }}
		>
			{initials}
		</span>
	);
}
