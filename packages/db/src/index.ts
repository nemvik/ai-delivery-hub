import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { dataRoot, id, now, redact } from "../../core/src/paths";
import {
  settingsSchema,
  type Run,
  type Settings,
} from "../../contracts/src/index";
import * as schema from "./schema";
export const tables = [
  "projects",
  "repositories",
  "surfaces",
  "command_profiles",
  "qa_profiles",
  "provider_profiles",
  "change_sets",
  "change_set_issues",
  "dependency_pins",
  "runs",
  "run_repositories",
  "snapshots",
  "steps",
  "process_records",
  "review_rounds",
  "findings",
  "finding_decisions",
  "scenarios",
  "scenario_results",
  "artifacts",
  "human_approvals",
  "publisher_destinations",
  "publish_jobs",
  "publish_receipts",
  "settings",
] as const;
export type Table = (typeof tables)[number];
export class Store {
  readonly sql: Database.Database;
  readonly orm: ReturnType<typeof drizzle>;
  readonly root: string;
  constructor(root = dataRoot()) {
    this.root = realpathSync(root);
    root = this.root;
    this.sql = new Database(join(root, "state.sqlite"));
    this.sql.pragma("journal_mode = WAL");
    this.sql.pragma("foreign_keys = ON");
    this.sql.pragma("busy_timeout = 5000");
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT,type TEXT NOT NULL,message TEXT NOT NULL,created_at TEXT NOT NULL);CREATE INDEX IF NOT EXISTS event_run ON events(run_id,seq);CREATE TABLE IF NOT EXISTS commands(id TEXT PRIMARY KEY,idempotency_key TEXT UNIQUE NOT NULL,type TEXT NOT NULL,run_id TEXT,data TEXT NOT NULL,state TEXT NOT NULL,created_at TEXT NOT NULL);CREATE TABLE IF NOT EXISTS resource_leases(resource TEXT NOT NULL, owner TEXT NOT NULL, fence INTEGER NOT NULL, heartbeat INTEGER NOT NULL, PRIMARY KEY(resource,owner));CREATE TABLE IF NOT EXISTS worker_lock(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,pid INTEGER NOT NULL,identity TEXT NOT NULL,heartbeat INTEGER NOT NULL,fence INTEGER NOT NULL);`,
    );
    this.sql.transaction(() => {
      for (const t of tables)
        this.sql.exec(
          `CREATE TABLE IF NOT EXISTS ${t}(id TEXT PRIMARY KEY,data TEXT NOT NULL,created_at TEXT NOT NULL)`,
        );
      this.sql
        .prepare("INSERT OR IGNORE INTO migrations VALUES(1,?)")
        .run(now());
    })();
    this.orm = drizzle(this.sql, { schema });
  }
  get<T>(table: Table, id: string): T | undefined {
    const row = this.sql
      .prepare(`SELECT data FROM ${table} WHERE id=?`)
      .get(id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as T) : undefined;
  }
  list<T>(table: Table): T[] {
    return (
      this.sql
        .prepare(`SELECT data FROM ${table} ORDER BY created_at DESC`)
        .all() as { data: string }[]
    ).map((r) => JSON.parse(r.data) as T);
  }
  put<T extends { id: string }>(table: Table, value: T) {
    this.sql
      .prepare(
        `INSERT INTO ${table}(id,data,created_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
      )
      .run(value.id, JSON.stringify(value), now());
    return value;
  }
  remove(table: Table, id: string) {
    this.sql.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
  }
  event(runId: string | null, type: string, message: string) {
    this.sql
      .prepare(
        "INSERT INTO events(run_id,type,message,created_at) VALUES(?,?,?,?)",
      )
      .run(runId, type, redact(message), now());
  }
  events(runId: string, after = 0) {
    return this.sql
      .prepare(
        "SELECT seq,run_id AS runId,type,message,created_at AS createdAt FROM events WHERE run_id=? AND seq>? ORDER BY seq LIMIT 250",
      )
      .all(runId, after);
  }
  updateRun(runId: string, patch: Partial<Run>) {
    const run = this.get<Run>("runs", runId);
    if (!run) throw new Error("Run not found");
    return this.put("runs", { ...run, ...patch, id: run.id, updatedAt: now() });
  }
  enqueue(type: string, runId: string | null, data: unknown, key: string) {
    const commandId = id();
    this.sql
      .prepare("INSERT OR IGNORE INTO commands VALUES(?,?,?,?,?,'pending',?)")
      .run(commandId, key, type, runId, JSON.stringify(data), now());
    this.sql
      .prepare(
        "UPDATE commands SET state='pending' WHERE idempotency_key=? AND state='failed'",
      )
      .run(key);
    return this.sql
      .prepare("SELECT * FROM commands WHERE idempotency_key=?")
      .get(key) as QueueCommand;
  }
  claim(): QueueCommand | undefined {
    return this.sql
      .transaction(() => {
        const c = this.sql
          .prepare(
            "SELECT * FROM commands WHERE state='pending' ORDER BY rowid LIMIT 1",
          )
          .get() as QueueCommand | undefined;
        if (c)
          this.sql
            .prepare("UPDATE commands SET state='claimed' WHERE id=?")
            .run(c.id);
        return c;
      })
      .immediate();
  }
  finish(id: string, state = "done") {
    this.sql.prepare("UPDATE commands SET state=? WHERE id=?").run(state, id);
  }
  settings(): Settings {
    return settingsSchema.parse(
      this.get<{ id: string; value: unknown }>("settings", "global")?.value ||
        {},
    );
  }
  close() {
    this.sql.close();
  }
}
export interface QueueCommand {
  id: string;
  idempotency_key: string;
  type: string;
  run_id: string | null;
  data: string;
  state: string;
  created_at: string;
}
