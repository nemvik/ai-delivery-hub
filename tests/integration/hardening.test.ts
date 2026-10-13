import { it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { Store } from "../../packages/db/src/index";
import { Worker } from "../../apps/worker/engine";
import { Resources } from "../../packages/core/src/resources";
import { createTask, startRun } from "../../packages/core/src/service";
import { generateDemo } from "../../packages/test-fixtures/src/generate";
import { childEnv, id } from "../../packages/core/src/paths";
import {
  processIdentity,
  type ProcessRecord,
} from "../../packages/adapters/src/process";
import { GitWorkspaces, git } from "../../packages/adapters/src/git";
import {
  settingsSchema,
  projectSchema,
  fakeRole,
  type Run,
  type Task,
  type Snapshot,
  type Artifact,
} from "../../packages/contracts/src/index";
import { decideFinding } from "../../packages/core/src/manual";
import { gates } from "../../packages/core/src/gates";
async function until(fn: () => boolean, message: string) {
  const deadline = Date.now() + 20000;
  while (!fn()) {
    if (Date.now() > deadline) throw new Error(message);
    await new Promise((r) => setTimeout(r, 25));
  }
}
function setup() {
  const store = new Store(mkdtempSync(join(tmpdir(), "hub-hardening-")));
  return { store, project: generateDemo(store) };
}
it("AT24 kills a real fixture worker, reconciles its agent and never repeats its writer", async () => {
  const { store, project } = setup();
  store.put("projects", {
    ...project,
    scenarios: project.scenarios.filter((s) => s.kind === "contract"),
  });
  const task = createTask(store, {
    projectId: project.id,
    title: "Crash recovery fixture",
    criteria: "Own the writer once",
    mode: "implement_review_qa",
    demoScenario: "hang",
  });
  const run = startRun(store, task.id, "crash-recovery-fixture");
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "apps/worker/main.ts"],
    {
      cwd: process.cwd(),
      env: { ...childEnv(), HUB_DATA_DIR: store.root },
      stdio: "ignore",
    },
  );
  let recovered: Worker | undefined;
  try {
    await until(
      () =>
        store
          .list<ProcessRecord>("process_records")
          .some((p) => p.runId === run.id && p.state === "running"),
      "Writer did not start",
    );
    const count = store.list<ProcessRecord>("process_records").length;
    const exited = new Promise((r) => child.once("exit", r));
    child.kill("SIGKILL");
    await exited;
    recovered = new Worker(store);
    await recovered.acquire();
    await recovered.tick();
    expect(store.get<Run>("runs", run.id)?.state).toBe("interrupted");
    expect(store.list<ProcessRecord>("process_records")).toHaveLength(count);
    for (const p of store.list<ProcessRecord>("process_records")) {
      expect(p.state).toBe("exited");
      expect(processIdentity(p.pid)).toBe("");
    }
    const next = startRun(
      store,
      store.list<Task>("change_sets").find((t) => t.mode === "qa_only")!.id,
      "after-real-restart",
    );
    await recovered.tick();
    await until(() => !recovered!.active.size, "QA after restart");
    expect(store.get<Run>("runs", next.id)?.state).toBe("awaiting_human_qa");
  } finally {
    child.kill("SIGTERM");
    await recovered?.stop();
    store.close();
  }
});
it("AT21 AT25 uncertain cleanup and expired heartbeats retain exclusive leases", async () => {
  const { store } = setup(),
    worker = new Worker(store);
  try {
    await worker.acquire();
    const lock = store.sql
      .prepare("SELECT owner,fence FROM worker_lock")
      .get() as { owner: string; fence: number };
    const resources = new Resources(store, lock.owner, lock.fence);
    const task = store.list<Task>("change_sets")[0]!,
      run = startRun(store, task.id, "lease-retention-test");
    await resources.with(
      run.id,
      ["exclusive:shared"],
      new AbortController().signal,
      async () => {
        store.put("process_records", {
          id: id(),
          runId: run.id,
          state: "uncertain",
        });
      },
    );
    store.sql.prepare("UPDATE resource_leases SET heartbeat=1").run();
    expect(resources.acquire("another-run", ["exclusive:shared"])).toBe(false);
    expect(
      resources.acquire("another-run", ["agent", "exclusive:shared"]),
    ).toBe(false);
    expect(
      store.sql
        .prepare("SELECT 1 FROM resource_leases WHERE owner='another-run'")
        .get(),
    ).toBeUndefined();
  } finally {
    await worker.stop();
    store.close();
  }
});
it("AT25 artifact quota pauses new runs without deleting work", async () => {
  const { store } = setup(),
    worker = new Worker(store);
  try {
    store.put("settings", {
      id: "global",
      value: settingsSchema.parse({ maxArtifactGiB: 0.01 }),
    });
    const path = join(store.root, "artifacts");
    mkdirSync(path);
    writeFileSync(
      join(path, "owned-fixture.bin"),
      Buffer.alloc(11 * 1024 * 1024),
    );
    const run = startRun(
      store,
      store.list<Task>("change_sets")[0]!.id,
      "disk-quota-fixture",
    );
    await worker.acquire();
    await worker.tick();
    expect(store.get<Run>("runs", run.id)?.queueReason).toContain("disk space");
    expect(worker.active.size).toBe(0);
    expect(readFileSync(join(path, "owned-fixture.bin")).length).toBe(
      11 * 1024 * 1024,
    );
  } finally {
    await worker.stop();
    store.close();
  }
});
it("AT06 AT08 immutable inherited roles, literal pins and contended Git cache", () => {
  const { store, project } = setup();
  try {
    store.put("settings", {
      id: "global",
      value: settingsSchema.parse({
        defaultRoles: { reviewer: { ...fakeRole, model: "global-role" } },
      }),
    });
    store.put("projects", {
      ...project,
      defaultRoles: { implementer: { ...fakeRole, model: "project-role" } },
    });
    const task = createTask(store, {
      projectId: project.id,
      title: "Inherited roles",
      criteria: "Preserve immutable roles",
      reviewer: { ...fakeRole, model: "task-role" },
    });
    const run = startRun(store, task.id, "immutable-roles");
    store.put("change_sets", {
      ...task,
      reviewer: { ...fakeRole, model: "later-role" },
    });
    expect(run.config.task.implementer.model).toBe("project-role");
    expect(run.config.task.reviewer.model).toBe("task-role");
    const gitWork = new GitWorkspaces(store);
    gitWork.lock("shared-cache", () =>
      expect(() =>
        new GitWorkspaces(store).lock("shared-cache", () => undefined),
      ).toThrow("busy"),
    );
    expect(() => gitWork.lock("shared-cache", () => undefined)).not.toThrow();
  } finally {
    store.close();
  }
});
it("AT39 explicit finding exceptions retain failed machine results", async () => {
  const { store, project } = setup(),
    worker = new Worker(store);
  try {
    store.put("projects", {
      ...project,
      scenarios: project.scenarios.filter((s) => s.kind === "contract"),
    });
    const task = createTask(store, {
      projectId: project.id,
      title: "Needs decision",
      mode: "implement_review_qa",
      maxReviewRounds: 1,
      criteria: "Keep decision provenance",
      demoScenario: "limit",
    });
    const run = startRun(store, task.id, "human-exception");
    await worker.acquire();
    await worker.tick();
    await until(() => !worker.active.size, "Review");
    const final = store.get<Run>("runs", run.id)!,
      finding = store
        .list<{ localId: string; runId: string }>("findings")
        .find((f) => f.runId === run.id)!;
    decideFinding(store, final, {
      snapshotId: final.snapshotId,
      findingLocalId: finding.localId,
      decision: "false_positive",
      author: "Local reviewer",
      reason: "Explicit fixture exception",
    });
    expect(
      gates(store, final, store.get<Snapshot>("snapshots", final.snapshotId!)!)
        .review,
    ).toBe("failed");
    expect(store.list("finding_decisions")).toHaveLength(1);
  } finally {
    await worker.stop();
    store.close();
  }
});
it("AT20 AT21 configured suites import real files and serialize approved command resources", async () => {
  const { store, project } = setup(),
    worker = new Worker(store);
  try {
    const source = project.repositories[0]!.sourcePath;
    const exclusive = join(store.root, "test-shared-resource");
    // An exclusive create fails if two approved commands overlap.
    writeFileSync(
      join(source, "qa.mjs"),
      `import {writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
const path=process.argv[2];writeFileSync(path,'busy',{flag:'wx'});mkdirSync('build',{recursive:true});
setTimeout(()=>{const r={schemaVersion:'1.0',runId:process.env.HUB_RUN_ID,snapshotId:process.env.HUB_SNAPSHOT_ID,suiteId:'approved-suite',source:'runner',runner:'fixture-command',verifiedBy:null,startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),exitCode:0,results:[{scenarioId:'approved',criterionIds:['exclusive'],surfaceKeys:['admin'],failureKind:null,status:'passed',expected:'exclusive operation',observed:'exclusive resource acquired',assertions:[{description:'exclusive file created',passed:true}],evidenceIds:['result-log'],attempt:1,durationMs:2000}]};
writeFileSync('build/result.json',JSON.stringify(r));writeFileSync('build/evidence.txt','Actual exclusive operation finished');unlinkSync(path);},2000);`,
    );
    git(source, ["add", "qa.mjs"]);
    git(source, [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@local",
      "commit",
      "-m",
      "Approved test runner",
    ]);
    const configured = projectSchema.parse({
      name: project.name,
      trusted: true,
      demo: true,
      repositories: project.repositories,
      surfaces: project.surfaces,
      commands: [
        {
          id: "approved-suite",
          repoKey: "monorepo",
          executable: process.execPath,
          args: ["qa.mjs", exclusive],
          kind: "suite",
          phase: "qa",
          reportPath: "build/result.json",
          resourceIds: ["shared-fixture"],
          artifacts: [
            {
              id: "result-log",
              path: "build/evidence.txt",
              scenarioId: "approved",
              surfaceKey: "admin",
            },
          ],
        },
      ],
      scenarios: [
        {
          id: "approved",
          kind: "command",
          title: "Approved suite",
          surfaceKeys: ["admin"],
          expected: "Exclusive assertion",
          commandId: "approved-suite",
        },
      ],
    });
    store.put("projects", { ...project, ...configured });
    store.put("settings", {
      id: "global",
      value: settingsSchema.parse({ maxQaEnvironments: 2 }),
    });
    const task = store.list<Task>("change_sets")[0]!,
      a = startRun(store, task.id, "approved-runtime-a"),
      b = startRun(store, task.id, "approved-runtime-b");
    await worker.acquire();
    await worker.tick();
    await until(
      () =>
        store
          .get<Run>("runs", b.id)
          ?.queueReason?.includes("exclusive:shared-fixture") || false,
      "Second QA did not wait for command resource",
    );
    await until(() => !worker.active.size, "Approved suite completion");
    for (const run of [a, b]) {
      const final = store.get<Run>("runs", run.id)!;
      expect(final.state, final.error || "").toBe("awaiting_human_qa");
      expect(
        store
          .list<Artifact>("artifacts")
          .some((a) => a.runId === run.id && a.author === "fixture-command"),
      ).toBe(true);
    }
  } finally {
    await worker.stop();
    store.close();
  }
});
it("AT22 a required service crashing after readiness cannot produce a successful run", async () => {
  const { store, project } = setup(),
    worker = new Worker(store);
  try {
    const source = project.repositories[0]!.sourcePath;
    writeFileSync(
      join(source, "crash-service.mjs"),
      `import http from 'node:http';http.createServer((q,r)=>{r.setHeader('Content-Type','application/json');r.end(JSON.stringify({runId:process.env.HUB_RUN_ID}));}).listen(Number(process.argv[2]),'127.0.0.1');setTimeout(()=>process.exit(1),1200);`,
    );
    git(source, ["add", "crash-service.mjs"]);
    git(source, [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@local",
      "commit",
      "-m",
      "Service crash fixture",
    ]);
    const config = projectSchema.parse({
      name: project.name,
      trusted: true,
      demo: true,
      repositories: project.repositories,
      surfaces: project.surfaces,
      commands: [
        {
          id: "server",
          repoKey: "monorepo",
          executable: process.execPath,
          args: ["crash-service.mjs", "{{ports.backend}}"],
          kind: "start",
          phase: "qa",
        },
        {
          id: "delayed-check",
          repoKey: "monorepo",
          executable: process.execPath,
          args: ["-e", "setTimeout(()=>process.exit(0),2500)"],
          phase: "qa",
          kind: "check",
        },
      ],
      runtime: {
        isolation: "isolated",
        services: [
          {
            key: "backend",
            commandId: "server",
            portKey: "backend",
            readinessPath: "/health",
            identityField: "runId",
            identityValue: "{{run.id}}",
          },
        ],
      },
      scenarios: project.scenarios.filter((s) => s.kind === "contract"),
    });
    store.put("projects", { ...project, ...config });
    const run = startRun(
      store,
      store.list<Task>("change_sets")[0]!.id,
      "service-crash-after-readiness",
    );
    await worker.acquire();
    await worker.tick();
    await until(() => !worker.active.size, "Crashed service cleanup");
    const final = store.get<Run>("runs", run.id)!;
    expect(final.state).toBe("failed");
    expect(final.error).toContain("service stopped unexpectedly");
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

it("retention cleanup protects current work and recovers after deletion before audit commit", async () => {
  const { cleanupEvidence, retentionPreview } =
    await import("../../packages/adapters/src/publisher");
  const { store } = setup();
  try {
    const run = startRun(
      store,
      store.list<Task>("change_sets")[0]!.id,
      "retention-recovery",
    );
    expect(() => cleanupEvidence(store, run)).toThrow("protected");
    const old = {
      ...run,
      state: "verified" as const,
      archived: true,
      updatedAt: "2020-01-01T00:00:00.000Z",
    };
    store.put("runs", old);
    const ownWorktree = join(store.root, "runs", run.id, "worktrees");
    mkdirSync(ownWorktree, { recursive: true });
    writeFileSync(join(ownWorktree, "preserve.txt"), "user checkpoint");
    // The approved artifact directory is already absent: simulated deletion/crash boundary.
    expect(retentionPreview(store)).toHaveLength(1);
    cleanupEvidence(store, old);
    expect(store.get<Run>("runs", run.id)?.evidenceExpiredAt).toBeTruthy();
    expect(readFileSync(join(ownWorktree, "preserve.txt"), "utf8")).toBe(
      "user checkpoint",
    );
    expect(retentionPreview(store)).toHaveLength(0);
    expect(() =>
      cleanupEvidence(store, store.get<Run>("runs", run.id)!),
    ).not.toThrow();
  } finally {
    store.close();
  }
});
