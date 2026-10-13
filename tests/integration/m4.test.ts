import { it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../packages/db/src/index";
import { generateDemo } from "../../packages/test-fixtures/src/generate";
import { createTask, startRun } from "../../packages/core/src/service";
import { Worker } from "../../apps/worker/engine";
import { validateReview } from "../../packages/core/src/review";
import type {
  Run,
  ReviewRound,
  ScenarioResult,
  Snapshot,
} from "../../packages/contracts/src/index";
async function scenario(
  mode: "review_qa" | "implement_review_qa",
  scenario: "contract-defect" | "limit" | "coverage-gap" | "pass",
) {
  const store = new Store(mkdtempSync(join(tmpdir(), "hub-loop-")));
  const p = generateDemo(store);
  store.put("projects", {
    ...p,
    scenarios: p.scenarios.filter((s) => s.kind === "contract"),
  });
  const task = createTask(store, {
    projectId: p.id,
    title: "Contract review",
    criteria: "Existing clients must retain displayName",
    mode,
    demoScenario: scenario,
  });
  const run = startRun(store, task.id, "test-loop-run");
  const worker = new Worker(store);
  await worker.acquire();
  await worker.tick();
  while (worker.active.size) await new Promise((r) => setTimeout(r, 50));
  await worker.stop();
  return { store, run: store.get<Run>("runs", run.id)! };
}
it("AT14 actual contract failure → independent review → mapped fix → new snapshot → actual pass", async () => {
  const { store, run } = await scenario(
    "implement_review_qa",
    "contract-defect",
  );
  try {
    expect(run.state, run.error || "").toBe("awaiting_human_qa");
    const rounds = store
      .list<ReviewRound>("review_rounds")
      .sort((a, b) => a.round - b.round);
    expect(rounds).toHaveLength(2);
    expect(rounds[0]!.review.findings).toHaveLength(2);
    expect(rounds[1]!.review.findings).toHaveLength(0);
    expect(rounds[0]!.snapshotId).not.toBe(rounds[1]!.snapshotId);
    const tests = store.list<ScenarioResult>("scenario_results");
    expect(
      tests.find((t) => t.snapshotId === rounds[0]!.snapshotId)?.status,
    ).toBe("failed");
    expect(tests.find((t) => t.snapshotId === run.snapshotId)?.status).toBe(
      "passed",
    );
  } finally {
    store.close();
  }
});
it("AT15 exactly three reviews and two fixes lead to Needs input", async () => {
  const { store, run } = await scenario("implement_review_qa", "limit");
  try {
    expect(run.state, run.error || "").toBe("needs_input");
    expect(store.list("review_rounds")).toHaveLength(3);
    expect(
      store
        .list<{ role: string }>("steps")
        .filter((s) => s.role === "implementer"),
    ).toHaveLength(3);
  } finally {
    store.close();
  }
});
it("AT13 review-only never starts an implementer; AT16 missing repository coverage blocks", async () => {
  const { store, run } = await scenario("review_qa", "coverage-gap");
  try {
    expect(run.state).toBe("failed");
    expect(run.error).toContain("coverage");
    expect(
      store
        .list<{ role: string }>("steps")
        .filter((s) => s.role === "implementer"),
    ).toHaveLength(0);
  } finally {
    store.close();
  }
});
it("AT18 stale snapshot and foreign findings are rejected", async () => {
  const { store, run } = await scenario("review_qa", "pass");
  try {
    const round = store.list<ReviewRound>("review_rounds")[0]!,
      snapshot = store.get<Snapshot>("snapshots", run.snapshotId!)!;
    expect(() =>
      validateReview({ ...round.review, snapshotId: "different" }, snapshot),
    ).toThrow("Stale");
    expect(() =>
      validateReview(
        {
          ...round.review,
          findings: [
            {
              localId: "x",
              priorFindingId: null,
              severity: "P1",
              category: "scope",
              title: "bad",
              description: "bad",
              repoKey: "foreign",
              path: "../secret",
              startLine: 1,
              evidence: "x",
              suggestedFix: "x",
              suggestedVerification: "x",
            },
          ],
        },
        snapshot,
      ),
    ).toThrow("foreign");
  } finally {
    store.close();
  }
});
