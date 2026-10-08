import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { publicProcedure, router } from "..";

/**
 * Read-only bridge to Superset, the app spyd was forked from, so its open
 * workspaces can be picked up here: the worktree, its branch, and the Claude
 * conversation that ran in it (resumed with `claude --resume`).
 *
 * Superset keeps one `host.db` per host under ~/.superset/host/<id>/. Each is
 * opened read-only, per call - Superset may be running and writing to it, and
 * nothing here ever writes back.
 */

export interface SupersetWorkspace {
	id: string;
	projectName: string;
	repoPath: string;
	name: string;
	branch: string;
	worktreePath: string;
	/** ms; the newest first. */
	lastActivityAt: number | null;
	/** The latest Claude conversation in it, if one ever ran. */
	claudeSessionId: string | null;
	/** The worktree is still on disk - an archived-but-kept row can't open. */
	exists: boolean;
}

const SUPERSET_HOST_DIR = join(homedir(), ".superset", "host");

function hostDatabases(): string[] {
	if (!existsSync(SUPERSET_HOST_DIR)) return [];
	return readdirSync(SUPERSET_HOST_DIR)
		.map((id) => join(SUPERSET_HOST_DIR, id, "host.db"))
		.filter((path) => existsSync(path));
}

interface Row {
	id: string;
	project_name: string;
	repo_path: string;
	name: string | null;
	branch: string;
	worktree_path: string;
	last_activity_at: number | null;
	claude_session_id: string | null;
}

function readWorkspaces(path: string): SupersetWorkspace[] {
	const db = new Database(path, { readonly: true, fileMustExist: true });
	try {
		const rows = db
			.prepare(
				`select w.id, p.name as project_name, p.repo_path, w.name, w.branch,
				        w.worktree_path, w.last_activity_at,
				        (select b.agent_session_id from terminal_agent_bindings b
				          where b.workspace_id = w.id and b.agent_id = 'claude'
				            and b.agent_session_id is not null
				          order by coalesce(b.last_event_at, b.started_at) desc
				          limit 1) as claude_session_id
				   from workspaces w
				   join projects p on p.id = w.project_id
				  where w.archived_at is null
				  order by coalesce(w.last_activity_at, w.updated_at) desc
				  limit 200`,
			)
			.all() as Row[];
		return rows.map((row) => ({
			id: row.id,
			projectName: row.project_name,
			repoPath: row.repo_path,
			name: row.name || row.branch,
			branch: row.branch,
			worktreePath: row.worktree_path,
			lastActivityAt: row.last_activity_at,
			claudeSessionId: row.claude_session_id,
			exists: existsSync(row.worktree_path),
		}));
	} finally {
		db.close();
	}
}

export const createSupersetRouter = () =>
	router({
		/** Superset's open workspaces, newest first - empty when it isn't installed. */
		workspaces: publicProcedure.query((): SupersetWorkspace[] => {
			const all: SupersetWorkspace[] = [];
			for (const path of hostDatabases()) {
				try {
					all.push(...readWorkspaces(path));
				} catch (error) {
					// A schema from another Superset version: skip that host, keep going.
					console.warn(`[superset] couldn't read ${path}:`, error);
				}
			}
			return all.sort(
				(a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0),
			);
		}),
	});
