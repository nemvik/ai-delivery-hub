import { it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { Store } from "../../packages/db/src/index";
import { generateDemo } from "../../packages/test-fixtures/src/generate";
import { startRun, createTask, action } from "../../packages/core/src/service";
import { Worker } from "../../apps/worker/engine";
import {
  Processes,
  stopRecord,
  processIdentity,
  type ProcessRecord,
} from "../../packages/adapters/src/process";
import { Resources } from "../../packages/core/src/resources";
import { readiness } from "../../packages/adapters/src/qa";
import {
  settingsSchema,
  type Task,
  type Run,
} from "../../packages/contracts/src/index";
import { id, now } from "../../packages/core/src/paths";
import http from "node:http";
import type { AddressInfo } from "node:net";
function setup() {
  const store = new Store(mkdtempSync(join(tmpdir(), "hub-runtime-")));
  const project = generateDemo(store);
  return { store, project };
}
it("AT20 two real QA environments isolate ports, SQLite data and browser contexts", async () => {
  const { store, project } = setup();
  const worker = new Worker(store);
  try {
    store.put("projects", {
      ...project,
      scenarios: project.scenarios.filter((s) => s.kind === "web"),
    });
    store.put("settings", {
      id: "global",
      value: settingsSchema.parse({ maxQaEnvironments: 2 }),
    });
    const task = store.list<Task>("change_sets")[0]!,
      a = startRun(store, task.id, "concurrent-first"),
      b = startRun(store, task.id, "concurrent-second");
    await worker.acquire();
    await worker.tick();
    while (worker.active.size) await new Promise((r) => setTimeout(r, 50));
    expect(store.get<Run>("runs", a.id)?.state).toBe("awaiting_human_qa");
    expect(store.get<Run>("runs", b.id)?.state).toBe("awaiting_human_qa");
    const runtimes = store
      .list<{
        type: string;
        manifest: {
          runId: string;
          port: number;
          database: string;
          seed: string;
        };
      }>("steps")
      .filter((s) => s.type === "runtime")
      .map((s) => s.manifest);
    expect(new Set(runtimes.map((r) => r.port)).size).toBe(2);
    expect(new Set(runtimes.map((r) => r.database)).size).toBe(2);
    for (const r of runtimes) {
      const data = execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          "import {DatabaseSync} from 'node:sqlite';const d=new DatabaseSync(process.argv[1]); console.log(JSON.stringify(d.prepare('SELECT * FROM participants').all()))",
          r.database,
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      expect(data).toContain("Demo guest " + r.runId.slice(0, 8));
      expect(data).not.toContain(
        "Demo guest " +
          runtimes.find((o) => o.runId !== r.runId)!.runId.slice(0, 8),
      );
    }
  } finally {
    await worker.stop();
    store.close();
  }
});
it("AT21 exclusive shared resources serialize and acquisition is atomic", async () => {
  const { store } = setup();
  const worker = new Worker(store);
  try {
    await worker.acquire();
    const lock = store.sql
      .prepare("SELECT owner,fence FROM worker_lock")
      .get() as { owner: string; fence: number };
    const r = new Resources(store, lock.owner, lock.fence);
    expect(r.acquire("first", ["exclusive:db", "native"])).toBe(true);
    expect(r.acquire("second", ["agent", "exclusive:db"])).toBe(false);
    expect(
      store.sql
        .prepare("SELECT 1 FROM resource_leases WHERE resource='agent'")
        .get(),
    ).toBeUndefined();
    r.release("first");
    expect(r.acquire("second", ["exclusive:db"])).toBe(true);
  } finally {
    await worker.stop();
    store.close();
  }
});
it("AT22 readiness rejects a foreign service occupying a selected port", async () => {
  const server = http.createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end('{"runId":"foreign"}');
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    await expect(
      readiness(
        `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        "owned",
        new AbortController().signal,
        500,
      ),
    ).rejects.toThrow("identity mismatch");
  } finally {
    server.close();
  }
});
it("AT23 cancel kills the owned descendants and preserves another process", async () => {
  const { store } = setup();
  try {
    const manager = new Processes(store),
      a = new AbortController(),
      b = new AbortController();
    const output = join(store.root, "descendant");
    const code =
      "const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});require('node:fs').writeFileSync(process.argv[1],String(c.pid));setInterval(()=>{},1000)";
    const first = manager.run(
      "first",
      "tree",
      process.execPath,
      ["-e", code, output],
      { cwd: store.root, signal: a.signal },
    );
    const second = manager.run(
      "second",
      "parallel",
      process.execPath,
      ["-e", "setInterval(()=>{},1000)"],
      { cwd: store.root, signal: b.signal },
    );
    while (!existsSync(output)) await new Promise((r) => setTimeout(r, 25));
    a.abort();
    expect((await first).cancelled).toBe(true);
    expect(processIdentity(Number(readFileSync(output, "utf8")))).toBe("");
    const alive = store
      .list<ProcessRecord>("process_records")
      .find((p) => p.runId === "second")!;
    expect(processIdentity(alive.pid)).not.toBe("");
    b.abort();
    await second;
  } finally {
    store.close();
  }
});
it("AT24 reused PID cannot kill an unrelated process; recovery blocks new ownership work", async () => {
  const { store } = setup();
  try {
    const record: ProcessRecord = {
      id: id(),
      runId: "orphan",
      stepId: "test",
      pid: process.pid,
      token: "not-the-same-process",
      identity: "old identity",
      state: "running",
      startedAt: now(),
      exitCode: null,
      signal: null,
    };
    store.put("process_records", record);
    expect(await stopRecord(store, record)).toBe(false);
    expect(store.get<ProcessRecord>("process_records", record.id)?.state).toBe(
      "uncertain",
    );
    const worker = new Worker(store);
    await worker.acquire();
    const task = store.list<Task>("change_sets")[0]!,
      run = startRun(store, task.id, "recovery-blocked");
    await worker.tick();
    expect(store.get<Run>("runs", run.id)?.queueReason).toContain(
      "Recovery blocked",
    );
    await worker.stop();
  } finally {
    store.close();
  }
});
it("AT25 simulated clock discontinuity stops the writer without restarting it", async () => {
  const { store, project } = setup();
  const worker = new Worker(store);
  try {
    const t = createTask(store, {
      projectId: project.id,
      title: "Hang",
      criteria: "Cancel",
      mode: "implement_review_qa",
      demoScenario: "hang",
    });
    const run = startRun(store, t.id, "clock-discontinuity");
    await worker.acquire();
    await worker.tick();
    await new Promise((r) => setTimeout(r, 250));
    (worker as unknown as { lastTick: number }).lastTick = Date.now() - 60000;
    await worker.tick();
    while (worker.active.size) await new Promise((r) => setTimeout(r, 25));
    expect(store.get<Run>("runs", run.id)?.state).toBe("interrupted");
    action(store, run.id, { action: "cancel" });
    await worker.tick();
    expect(
      store
        .list<ProcessRecord>("process_records")
        .every((p) => p.state === "exited"),
    ).toBe(true);
  } finally {
    await worker.stop();
    store.close();
  }
});
