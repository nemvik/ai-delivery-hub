import { it, expect } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { Store } from "../../packages/db/src/index";
import { generateDemo } from "../../packages/test-fixtures/src/generate";
import { startRun } from "../../packages/core/src/service";
import { Worker } from "../../apps/worker/engine";
import {
  registerDestination,
  publishReport,
  publishable,
  createReport,
} from "../../packages/adapters/src/publisher";
import { maestroJUnit } from "../../packages/adapters/src/native";
import { parseQa } from "../../packages/adapters/src/checks";
import {
  registerArtifact,
  artifactRoot,
} from "../../packages/adapters/src/artifacts";
import type {
  Task,
  Run,
  Artifact,
  Snapshot,
} from "../../packages/contracts/src/index";
import { gates } from "../../packages/core/src/gates";
import { digest } from "../../packages/core/src/paths";
import qaExample from "../../examples/qa-result.example.json";
it("AT27 empty / skipped / flaky / blocked suites never become success", () => {
  const base = { ...qaExample, source: "runner", runId: "r", snapshotId: "s" };
  expect(() => parseQa({ ...base, results: [] }, "r", "s", 0)).toThrow("Empty");
  expect(() =>
    parseQa(
      {
        ...base,
        results: [{ ...base.results[0], status: "passed", assertions: [] }],
      },
      "r",
      "s",
      0,
    ),
  ).toThrow("assertions");
  for (const status of ["skipped", "flaky", "blocked", "not_run"] as const) {
    const result = parseQa(
      { ...base, results: [{ ...base.results[0], status }] },
      "r",
      "s",
      0,
    );
    expect(result.results[0]!.status).toBe(status);
  }
});
it("AT28 Maestro parser fixtures, missing device is not a native pass", () => {
  expect(
    maestroJUnit(
      '<testsuite><testcase name="a"/><testcase name="b"><failure message="x"/></testcase><testcase name="c"><skipped/></testcase></testsuite>',
    ).map((r) => r.status),
  ).toEqual(["passed", "failed", "skipped"]);
  expect(() => maestroJUnit("<testsuite/>")).toThrow("Empty");
  expect(() => maestroJUnit("<!DOCTYPE xx><testsuite/>")).toThrow("entities");
  expect(() =>
    maestroJUnit('<testsuite><testcase name="unfinished"/>'),
  ).toThrow("Malformed");
  expect(() =>
    maestroJUnit('<root><testcase name="unscoped"/></root>'),
  ).toThrow("root");
  expect(() =>
    maestroJUnit(
      '<testsuite><system-out><![CDATA[<testcase name="fake"/>]]></system-out></testsuite>',
    ),
  ).toThrow("Empty");
});
it("AT31 AT32 actual report is standalone and publication retry preserves run history", async () => {
  const store = new Store(mkdtempSync(join(tmpdir(), "hub-export-"))),
    worker = new Worker(store);
  try {
    const p = generateDemo(store);
    store.put("projects", {
      ...p,
      scenarios: p.scenarios.filter((s) => s.kind === "contract"),
    });
    const task = store.list<Task>("change_sets")[0]!,
      run = startRun(store, task.id, "publish-fixture");
    await worker.acquire();
    await worker.tick();
    while (worker.active.size) await new Promise((r) => setTimeout(r, 25));
    const final = store.get<Run>("runs", run.id)!;
    expect(final.state, final.error || "").toBe("awaiting_human_qa");
    const dest = registerDestination(
      store,
      "Approved test export",
      mkdtempSync(join(tmpdir(), "hub-destination-")),
    );
    const a = publishReport(store, final, dest.id),
      b = publishReport(store, store.get<Run>("runs", run.id)!, dest.id);
    expect(a.id).toBe(b.id);
    expect(store.list("publish_receipts")).toHaveLength(1);
    expect(readFileSync(join(a.location, "index.html"), "utf8")).toContain(
      "displayName",
    );
    expect(readFileSync(join(a.location, "index.html"), "utf8")).not.toContain(
      "https://",
    );
    expect(existsSync(join(a.location, "manifest.json"))).toBe(true);
    expect(
      store
        .list<Artifact>("artifacts")
        .some((a) => a.relativePath.endsWith("report.json")),
    ).toBe(true);
    const other = registerDestination(
      store,
      "Interrupted copy retry",
      mkdtempSync(join(tmpdir(), "hub-destination-")),
    );
    const partial =
      join(
        other.path,
        "delivery-hub",
        run.projectId,
        run.taskId,
        run.id,
        final.snapshotId!,
        a.manifestHash.slice(0, 16),
      ) + ".pending";
    mkdirSync(partial, { recursive: true });
    writeFileSync(join(partial, "report.json"), "interrupted");
    expect(publishReport(store, final, other.id).runId).toBe(run.id);
    expect(existsSync(partial)).toBe(false);
    expect(store.list("runs")).toHaveLength(1);
    const snapshot = store.get<Snapshot>("snapshots", final.snapshotId!)!;
    const original = createReport(store, final, snapshot);
    const reportArtifact = store
      .list<Artifact>("artifacts")
      .find((a) => a.author === "controller-report")!;
    // Reproduce a crash after artifact registration but before manifest commit.
    unlinkSync(
      join(
        artifactRoot(store, final, snapshot.id),
        dirname(reportArtifact.relativePath),
        "manifest.json",
      ),
    );
    writeFileSync(
      join(
        artifactRoot(store, final, snapshot.id),
        dirname(reportArtifact.relativePath),
        "manifest.json.pending",
      ),
      '{"interrupted":',
    );
    const recovered = createReport(store, final, snapshot);
    expect(digest(recovered)).toBe(digest(original));
    expect(gates(store, final, snapshot).evidenceIntegrity).toBe("passed");
    expect(
      store
        .list<Artifact>("artifacts")
        .filter((a) => a.author === "controller-report"),
    ).toHaveLength(2);
    await worker.handle("approve", final, {
      snapshotId: snapshot.id,
      author: "Tester",
      reason: "Reviewed synthetic evidence",
    });
    const approved = store.get<Run>("runs", run.id)!;
    const c = publishReport(store, approved, dest.id);
    expect(c.location).not.toBe(a.location);
    expect(
      JSON.parse(readFileSync(join(c.location, "report.json"), "utf8")).state,
    ).toBe("verified");
    expect(
      JSON.parse(readFileSync(join(a.location, "report.json"), "utf8")).state,
    ).toBe("awaiting_human_qa");
    const next = startRun(store, task.id, "second-report-run");
    await worker.tick();
    while (worker.active.size) await new Promise((r) => setTimeout(r, 25));
    const d = publishReport(store, store.get<Run>("runs", next.id)!, dest.id);
    expect(d.location).not.toBe(c.location);
    expect(existsSync(join(a.location, "index.html"))).toBe(true);
    const root = artifactRoot(store, final, final.snapshotId!);
    writeFileSync(join(root, "canary.txt"), "secret=synthetic-sensitive-value");
    const artifact = registerArtifact(
      store,
      final,
      final.snapshotId!,
      "canary.txt",
    );
    expect(() => publishable(join(root, "canary.txt"), artifact)).toThrow(
      "Sensitive",
    );
    writeFileSync(
      join(root, "canary.txt"),
      "Synthetic QA data. ".repeat(1000) + "secret=synthetic-sensitive-value",
    );
    execFileSync("/usr/bin/zip", ["-q", "trace-canary.zip", "canary.txt"], {
      cwd: root,
    });
    const archive = registerArtifact(
      store,
      final,
      final.snapshotId!,
      "trace-canary.zip",
    );
    expect(() => publishable(join(root, "trace-canary.zip"), archive)).toThrow(
      "Sensitive trace",
    );
    writeFileSync(join(root, "storage-state.json"), "{}");
    execFileSync(
      "/usr/bin/zip",
      ["-q", "storage-canary.zip", "storage-state.json"],
      { cwd: root },
    );
    const storage = registerArtifact(
      store,
      final,
      final.snapshotId!,
      "storage-canary.zip",
    );
    expect(() =>
      publishable(join(root, "storage-canary.zip"), storage),
    ).toThrow("Sensitive trace entries");
  } finally {
    await worker.stop();
    store.close();
  }
});
