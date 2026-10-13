import type {
  Run,
  Snapshot,
  ScenarioResult,
  ReviewRound,
  Artifact,
} from "../../contracts/src/index";
import { Store } from "../../db/src/index";
import { readFileSync } from "node:fs";
import { safePath, hash } from "./paths";
import { artifactRoot } from "../../adapters/src/artifacts";
export function gates(store: Store, run: Run, snapshot: Snapshot) {
  const results = store
    .list<ScenarioResult>("scenario_results")
    .filter((r) => r.runId === run.id && r.snapshotId === snapshot.id);
  const reviews = store
    .list<ReviewRound>("review_rounds")
    .filter((r) => r.runId === run.id && r.snapshotId === snapshot.id);
  const check = (id: string) => {
    const rows = results.filter((r) => r.scenarioId === id);
    return (
      rows.length > 0 &&
      rows.every(
        (r) =>
          r.status === "passed" &&
          r.source !== "manual" &&
          r.assertions.length > 0 &&
          r.assertions.every((a) => a.passed),
      )
    );
  };
  const review =
    run.config.task.mode === "qa_only"
      ? "not_required"
      : reviews.length &&
          reviews[0]!.review.verdict !== "incomplete" &&
          reviews[0]!.review.coverageGaps.length === 0 &&
          !reviews[0]!.review.findings.some(
            (f) => f.severity === "P0" || f.severity === "P1",
          )
        ? "passed"
        : "failed";
  const repoChecks = run.config.project.commands
    .filter((c) => c.kind !== "start")
    .every((c) => check("check:" + c.id))
    ? "passed"
    : "failed";
  const integration = run.config.project.scenarios.filter(
    (s) => s.required && s.kind !== "native" && s.kind !== "manual",
  );
  const integrationQa = integration.length
    ? integration.every((s) => check(s.id))
      ? "passed"
      : "failed"
    : "not_configured";
  const native = run.config.project.scenarios.filter(
    (s) => s.required && s.kind === "native",
  );
  const nativeQa = native.length
    ? native.every((s) => check(s.id))
      ? "passed"
      : "failed"
    : "not_required";
  const artifacts = store
    .list<Artifact>("artifacts")
    .filter((a) => a.runId === run.id && a.snapshotId === snapshot.id);
  let evidenceIntegrity = true;
  for (const a of artifacts) {
    try {
      if (
        hash(
          readFileSync(
            safePath(artifactRoot(store, run, snapshot.id), a.relativePath),
          ),
        ) !== a.sha256
      )
        evidenceIntegrity = false;
    } catch {
      evidenceIntegrity = false;
    }
  }
  for (const r of results)
    for (const eid of r.evidenceIds)
      if (!artifacts.some((a) => a.id === eid)) evidenceIntegrity = false;
  const automatic =
    repoChecks === "passed" &&
    ["not_required", "passed"].includes(review) &&
    integrationQa === "passed" &&
    ["passed", "not_required"].includes(nativeQa) &&
    evidenceIntegrity &&
    !run.stale;
  return {
    repoChecks,
    review,
    integrationQa,
    nativeQa,
    evidenceIntegrity: evidenceIntegrity ? "passed" : "failed",
    humanApproval: run.state === "verified" ? "passed" : "required",
    automatic,
    manualScenarios: run.config.project.scenarios
      .filter((s) => s.required && s.kind === "manual")
      .map((s) => s.id),
  };
}
