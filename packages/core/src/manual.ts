import { z } from "zod";
import { writeFileSync } from "node:fs";
import { Store } from "../../db/src/index";
import type { Run } from "../../contracts/src/index";
import { artifactRoot, registerArtifact } from "../../adapters/src/artifacts";
import { id, safePath } from "./paths";
const evidence = z
  .object({
    snapshotId: z.string(),
    author: z.string().min(1).max(100),
    scenarioId: z.string(),
    surfaceKey: z.string(),
    base64: z
      .string()
      .min(1)
      .max(8 * 1024 * 1024),
    label: z.enum(["manual", "web/mobile viewport"]).default("manual"),
  })
  .strict();
export function manualEvidence(store: Store, run: Run, input: unknown) {
  const value = evidence.parse(input);
  if (value.snapshotId !== run.snapshotId)
    throw new Error("Evidence snapshot mismatch");
  if (!run.config.project.scenarios.some((s) => s.id === value.scenarioId))
    throw new Error("Unknown scenario");
  if (!run.config.project.surfaces.some((s) => s.key === value.surfaceKey))
    throw new Error("Unknown surface");
  const bytes = Buffer.from(value.base64, "base64");
  if (
    bytes.length > 5 * 1024 * 1024 ||
    bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
  )
    throw new Error("Only PNG screenshots up to 5 MiB are accepted");
  const name = "manual-" + id() + ".png";
  writeFileSync(
    safePath(artifactRoot(store, run, value.snapshotId), name, false),
    bytes,
    { flag: "wx" },
  );
  const artifact = registerArtifact(store, run, value.snapshotId, name, {
    source: "manual",
    scenarioId: value.scenarioId,
    surfaceKey:
      value.label === "web/mobile viewport"
        ? "web/mobile viewport"
        : value.surfaceKey,
    author: value.author,
    sensitivity: "review_required",
  });
  store.event(
    run.id,
    "manual_evidence",
    `Manual evidence by ${value.author}; no automated result changed.`,
  );
  return artifact;
}
const decisionSchema = z
  .object({
    snapshotId: z.string(),
    findingLocalId: z.string(),
    decision: z.enum(["dispute", "accept_risk", "false_positive"]),
    author: z.string().min(1).max(100),
    reason: z.string().min(5).max(3000),
  })
  .strict();
export function decideFinding(store: Store, run: Run, input: unknown) {
  const value = decisionSchema.parse(input);
  if (
    value.snapshotId !== run.snapshotId ||
    ["running", "queued"].includes(run.state)
  )
    throw new Error("Decision requires the current terminal snapshot");
  const finding = store
    .list<{ runId: string; snapshotId: string; localId: string }>("findings")
    .find(
      (f) =>
        f.runId === run.id &&
        f.snapshotId === value.snapshotId &&
        f.localId === value.findingLocalId,
    );
  if (!finding) throw new Error("Finding not found");
  const result = store.put("finding_decisions", {
    id: id(),
    runId: run.id,
    ...value,
    createdAt: new Date().toISOString(),
  });
  store.event(
    run.id,
    "finding_decision",
    `${value.author}: ${value.decision} ${value.findingLocalId} — ${value.reason}`,
  );
  return result;
}
export function reviewArtifact(
  store: Store,
  artifactId: string,
  input: unknown,
) {
  const value = z
    .object({
      snapshotId: z.string(),
      sha256: z.string(),
      author: z.string().min(1),
      reason: z.string().min(5),
      synthetic: z.literal(true),
    })
    .strict()
    .parse(input);
  const artifact = store.get<import("../../contracts/src/index").Artifact>(
    "artifacts",
    artifactId,
  );
  if (
    !artifact ||
    artifact.snapshotId !== value.snapshotId ||
    artifact.sha256 !== value.sha256
  )
    throw new Error("Artifact review identity mismatch");
  const run = store.get<Run>("runs", artifact.runId);
  if (
    !run ||
    run.snapshotId !== value.snapshotId ||
    ["queued", "running"].includes(run.state)
  )
    throw new Error("Artifact review requires the current terminal snapshot");
  store.put("human_approvals", {
    id: id(),
    kind: "artifact_sensitivity",
    runId: run.id,
    artifactId,
    snapshotId: value.snapshotId,
    sha256: value.sha256,
    author: value.author,
    reason: value.reason,
    createdAt: new Date().toISOString(),
  });
  return store.put("artifacts", { ...artifact, sensitivity: "synthetic" });
}
