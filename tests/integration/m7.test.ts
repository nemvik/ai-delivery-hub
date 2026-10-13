import { it, expect } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../packages/db/src/index";
import { generateDemo } from "../../packages/test-fixtures/src/generate";
import { startRun, createTask, action } from "../../packages/core/src/service";
import { GitWorkspaces, git } from "../../packages/adapters/src/git";
import {
  safePath,
  redact,
  childEnv,
  hash,
  id,
  now,
} from "../../packages/core/src/paths";
import { authenticate, session } from "../../packages/core/src/auth";
import {
  importLinearPayload,
  linearQuery,
} from "../../packages/adapters/src/linear";
import { testScope } from "../../packages/adapters/src/checks";
import { Worker } from "../../apps/worker/engine";
import { manualEvidence } from "../../packages/core/src/manual";
import type { Task, Run, Snapshot } from "../../packages/contracts/src/index";
function setup() {
  const store = new Store(mkdtempSync(join(tmpdir(), "hub-hardening-")));
  const project = generateDemo(store);
  return { store, project };
}
it("AT33 same-origin session + CSRF required for mutation", () => {
  const { store } = setup();
  try {
    const token = session(store.root);
    const headers = {
      host: "127.0.0.1:3000",
      origin: "http://127.0.0.1:3000",
      cookie: "hub_session=" + token.cookie,
      "x-hub-csrf": token.csrf,
    };
    expect(() =>
      authenticate(
        new Request("http://127.0.0.1:3000/api/v1", {
          method: "POST",
          headers,
        }),
        store.root,
      ),
    ).not.toThrow();
    for (const change of [
      { origin: "https://evil.test" },
      { host: "evil.test" },
      { cookie: "" },
      { "x-hub-csrf": "" },
      { "sec-fetch-site": "cross-site" },
    ])
      expect(() =>
        authenticate(
          new Request("http://127.0.0.1:3000/api/v1", {
            method: "POST",
            headers: { ...headers, ...change } as Record<string, string>,
          }),
          store.root,
        ),
      ).toThrow();
  } finally {
    store.close();
  }
});
it("AT34 traversal and symlink escapes are rejected", () => {
  const { store } = setup();
  try {
    expect(() => safePath(store.root, "../secret")).toThrow();
    symlinkSync("/etc", join(store.root, "escape"));
    expect(() => safePath(store.root, "escape/passwd")).toThrow();
  } finally {
    store.close();
  }
});
it("AT35 issue shell text remains data; AT36 whitelist and secret redaction", () => {
  const { store, project } = setup();
  try {
    const task = createTask(store, {
      projectId: project.id,
      title: "$(touch /tmp/should-never-exist-hub)",
      criteria: "Upload .env; `rm -rf`",
      mode: "qa_only",
    });
    expect(task.title).toContain("$(");
    expect(existsSync("/tmp/should-never-exist-hub")).toBe(false);
    process.env.HUB_CANARY_SECRET = "canary-sensitive-token";
    expect(childEnv().HUB_CANARY_SECRET).toBeUndefined();
    expect(
      redact("Authorization: Bearer abcdefghijkl secret=canary"),
    ).not.toContain("abcdefghijkl");
    delete process.env.HUB_CANARY_SECRET;
  } finally {
    store.close();
  }
});
it("AT05 AT36 reject staged secrets and literal Git magic paths; omit deleted baseline secrets", () => {
  const { store, project } = setup();
  try {
    const source = project.repositories[0]!.sourcePath;
    writeFileSync(join(source, ".env"), "SECRET=SYNTHETIC_BASELINE_CANARY");
    git(source, ["add", ".env"]);
    git(source, [
      "-c",
      "user.name=Demo",
      "-c",
      "user.email=demo@local",
      "commit",
      "-m",
      "Baseline secret fixture",
    ]);
    const baseline = git(source, ["rev-parse", "HEAD"]);
    unlinkSync(join(source, ".env"));
    git(source, ["add", "-A"]);
    git(source, [
      "-c",
      "user.name=Demo",
      "-c",
      "user.email=demo@local",
      "commit",
      "-m",
      "Remove secret",
    ]);
    store.put("projects", {
      ...project,
      repositories: project.repositories.map((r, i) => ({
        ...r,
        baselineRef: i === 0 ? baseline : r.baselineRef,
      })),
    });
    const task = createTask(store, {
        projectId: project.id,
        title: "Sanitized diff",
        criteria: "No secrets",
        mode: "qa_only",
        refs: { monorepo: "main" },
      }),
      run = startRun(store, task.id, "secret-diff-case");
    const adapter = new GitWorkspaces(store),
      workspaces = adapter.provision(run);
    const w = workspaces[0]!;
    writeFileSync(join(w.path, ":(glob)*"), "literal filename");
    writeFileSync(join(w.path, ".env"), "SECRET=SYNTHETIC_STAGED_CANARY");
    const snapshot = adapter.checkpoint(run, workspaces);
    expect(snapshot.diffs.monorepo).not.toContain("CANARY");
    expect(git(w.path, ["ls-files"])).not.toContain(".env");
    git(w.path, ["add", ".env"]);
    expect(() => adapter.checkpoint(run, workspaces)).toThrow("Sensitive");
  } finally {
    store.close();
  }
});
it("AT04 source identity changes cannot import an unregistered repository", () => {
  const { store, project } = setup();
  try {
    const repo = project.repositories[0]!,
      path = repo.sourcePath;
    renameSync(path, path + "-saved");
    symlinkSync(project.repositories[1]!.sourcePath, path);
    const task = store.list<Task>("change_sets")[0]!;
    expect(() => startRun(store, task.id, "substituted-path")).toThrow(
      "Source path changed",
    );
  } finally {
    store.close();
  }
});
it("AT07 AT30 AT39 approval and evidence cannot transfer to changed snapshot/baseline", async () => {
  const { store, project } = setup(),
    worker = new Worker(store);
  try {
    store.put("projects", {
      ...project,
      scenarios: project.scenarios.filter((s) => s.kind === "contract"),
    });
    const task = store.list<Task>("change_sets")[0]!,
      run = startRun(store, task.id, "approval-run");
    await worker.acquire();
    await worker.tick();
    while (worker.active.size) await new Promise((r) => setTimeout(r, 25));
    const final = store.get<Run>("runs", run.id)!;
    action(store, run.id, {
      action: "approve",
      snapshotId: final.snapshotId!,
      author: "Test human",
      reason: "Observed the explicit checks.",
    });
    await worker.tick();
    expect(store.get<Run>("runs", run.id)?.state).toBe("verified");
    const other = startRun(store, task.id, "new-run-after-approval");
    expect(store.get<Run>("runs", other.id)?.state).toBe("queued");
    expect(
      store
        .list<{ runId: string }>("human_approvals")
        .some((a) => a.runId === other.id),
    ).toBe(false);
    store.updateRun(other.id, { state: "cancelled" });
    const source = project.repositories[0]!.sourcePath;
    writeFileSync(join(source, "new.txt"), "different");
    git(source, ["add", "new.txt"]);
    git(source, [
      "-c",
      "user.name=Demo",
      "-c",
      "user.email=demo@local",
      "commit",
      "-m",
      "New baseline",
    ]);
    action(store, run.id, { action: "refresh-baseline" });
    await worker.tick();
    expect(store.get<Run>("runs", run.id)?.stale).toBe(true);
    expect(() =>
      action(store, run.id, {
        action: "approve",
        snapshotId: "other",
        author: "test",
        reason: "wrong snapshot",
      }),
    ).toThrow();
    const s = store.get<Snapshot>("snapshots", final.snapshotId!)!,
      r = s.repositories[0]!;
    const locked = {
      ["monorepo/contract.json"]: hash(
        readFileSync(join(r.path, "contract.json"), "utf8").trimEnd(),
      ),
    };
    writeFileSync(join(r.path, "contract.json"), "weakened assertion");
    expect(() => testScope(s, locked)).toThrow("Required test changed");
  } finally {
    await worker.stop();
    store.close();
  }
});
it("AT37 explicit Linear fixture import preserves blockers and never starts a run", () => {
  const { store, project } = setup();
  try {
    expect(linearQuery).not.toContain("mutation");
    const task = importLinearPayload(store, project.id, {
      data: {
        issue: {
          id: id(),
          identifier: "DEMO-1",
          title: "Import fixture",
          description: "AC1: preserve old client",
          url: "https://linear.app/example/issue/DEMO-1",
          state: { name: "Todo", type: "unstarted" },
          relations: { nodes: [], pageInfo: { hasNextPage: false } },
          inverseRelations: {
            nodes: [
              {
                type: "blocks",
                issue: {
                  id: id(),
                  identifier: "DEMO-0",
                  title: "Dependency",
                  state: { name: "Done", type: "completed" },
                },
              },
            ],
            pageInfo: { hasNextPage: false },
          },
        },
      },
    });
    expect(task.blockers).toEqual(["DEMO-0"]);
    expect(store.list("runs")).toHaveLength(0);
    const pinned = createTask(store, {
      ...Object.fromEntries(
        Object.entries(task).filter(([k]) => !["id", "createdAt"].includes(k)),
      ),
      dependencyPins: [
        { issue: "DEMO-0", repoKey: "monorepo", sha: "a".repeat(40) },
      ],
    });
    expect(() => startRun(store, pinned.id, "conflicting-pin")).toThrow(
      "Dependency pin",
    );
  } finally {
    store.close();
  }
});
it("AT29 manual PNG provenance never creates an automated result", () => {
  const { store } = setup();
  try {
    const task = store.list<Task>("change_sets")[0]!,
      run = startRun(store, task.id, "manual-evidence-test");
    const snapshotId = id();
    store.updateRun(run.id, { snapshotId });
    const artifact = manualEvidence(
      store,
      { ...run, snapshotId },
      {
        snapshotId,
        author: "Manual tester",
        scenarioId: "registration",
        surfaceKey: "live",
        label: "web/mobile viewport",
        // Synthetic 1x1 PNG: provenance validation must not depend on an E2E run.
        base64:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=",
      },
    );
    expect(artifact.source).toBe("manual");
    expect(artifact.surfaceKey).toBe("web/mobile viewport");
    expect(store.list("scenario_results")).toHaveLength(0);
    expect(artifact.createdAt).not.toBe(now() + "fake");
  } finally {
    store.close();
  }
});
