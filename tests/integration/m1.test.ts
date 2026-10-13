import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../packages/db/src/index";
import { generateDemo } from "../../packages/test-fixtures/src/generate";
import { startRun, createTask } from "../../packages/core/src/service";
import { Worker } from "../../apps/worker/engine";
import type { Run, Artifact, Task } from "../../packages/contracts/src/index";
const stores: Store[] = [];
afterEach(() => stores.splice(0).forEach((s) => s.close()));
function setup() {
  const root = mkdtempSync(join(tmpdir(), "hub-m1-"));
  const store = new Store(root);
  stores.push(store);
  const project = generateDemo(store);
  store.put("projects", {
    ...project,
    scenarios: project.scenarios.filter((s) => s.kind === "web"),
  });
  return { store, project };
}
async function finish(worker: Worker, runId: string) {
  await worker.tick();
  const deadline = Date.now() + 60000;
  while (worker.active.has(runId) && Date.now() < deadline)
    await new Promise((r) => setTimeout(r, 100));
  expect(worker.active.size).toBe(0);
}
describe("M1 real vertical slice", () => {
  it("AT19 duplicate start is durable and idempotent", () => {
    const { store } = setup();
    const task = store.list<Task>("change_sets")[0]!;
    const a = startRun(store, task.id, "same-request-123");
    const b = startRun(store, task.id, "same-request-123");
    expect(a.id).toBe(b.id);
    expect(store.list("runs")).toHaveLength(1);
    expect(store.events(a.id)).toHaveLength(1);
  });
  it("AT01 real Playwright registration, screenshot and reconnectable events", async () => {
    const { store } = setup();
    const task = store.list<Task>("change_sets")[0]!;
    const run = startRun(store, task.id, "real-web-run-123");
    const worker = new Worker(store);
    await worker.acquire();
    await finish(worker, run.id);
    await worker.stop();
    const updated = store.get<Run>("runs", run.id)!;
    expect(updated.state, updated.error || "").toBe("awaiting_human_qa");
    const artifacts = store.list<Artifact>("artifacts");
    expect(artifacts.some((a) => a.relativePath === "admin.png")).toBe(true);
    for (const a of artifacts) {
      expect(a.runId).toBe(run.id);
      expect(a.snapshotId).toBe(updated.snapshotId);
      expect(
        existsSync(
          join(
            store.root,
            "artifacts",
            run.projectId,
            run.taskId,
            run.id,
            a.snapshotId,
            a.relativePath,
          ),
        ),
      ).toBe(true);
    }
    const events = store.events(run.id) as { seq: number }[];
    expect(store.events(run.id, events[0]!.seq)).toHaveLength(
      events.length - 1,
    );
  });
  it("AT01 an actual web assertion failure remains red", async () => {
    const { store, project } = setup();
    const task = createTask(store, {
      projectId: project.id,
      title: "Broken registration",
      criteria: "Admin receives registration",
      mode: "qa_only",
      demoScenario: "web-fail",
    });
    const run = startRun(store, task.id, "failing-run-123");
    const worker = new Worker(store);
    await worker.acquire();
    await finish(worker, run.id);
    await worker.stop();
    expect(store.get<Run>("runs", run.id)?.state).toBe("failed");
    const findings = store.list<{
      source: string;
      scenarioId: string;
      resultId: string;
      snapshotId: string;
    }>("findings");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      source: "qa",
      scenarioId: "registration",
      snapshotId: store.get<Run>("runs", run.id)?.snapshotId,
    });
    expect(store.get("scenario_results", findings[0]!.resultId)).toMatchObject({
      status: "failed",
    });
    expect(
      store
        .list<Artifact>("artifacts")
        .some((a) => a.relativePath === "failure.png"),
    ).toBe(true);
  });
  it("AT19 a second worker cannot acquire live ownership", async () => {
    const { store } = setup();
    const one = new Worker(store);
    await one.acquire();
    await expect(new Worker(store).acquire()).rejects.toThrow("Another worker");
    await one.stop();
  });
});
