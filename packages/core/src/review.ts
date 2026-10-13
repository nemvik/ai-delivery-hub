import Ajv2020 from "ajv/dist/2020.js";
import schema from "../../../contracts/review.schema.json";
import { readFileSync } from "node:fs";
import { safePath } from "./paths";
import type { Snapshot, Review } from "../../contracts/src/index";
const validator = new Ajv2020({ allErrors: true, strict: false }).compile(
  schema,
);
export function validateReview(value: unknown, snapshot: Snapshot): Review {
  if (!validator(value))
    throw new Error(
      "Invalid review schema: " + JSON.stringify(validator.errors),
    );
  const review = value as unknown as Review;
  if (review.snapshotId !== snapshot.id)
    throw new Error("Stale review snapshot");
  const seen = new Set<string>();
  for (const repo of review.reviewedRepositories) {
    const expected = snapshot.repositories.find(
      (r) => r.repoKey === repo.repoKey,
    );
    if (
      !expected ||
      expected.headSha !== repo.headSha ||
      seen.has(repo.repoKey)
    )
      throw new Error("Invalid review repository identity");
    seen.add(repo.repoKey);
  }
  if (snapshot.repositories.some((r) => !seen.has(r.repoKey)))
    throw new Error("Incomplete repository coverage");
  const ids = new Set<string>();
  for (const finding of review.findings) {
    if (ids.has(finding.localId)) throw new Error("Duplicate finding ID");
    ids.add(finding.localId);
    const repo = snapshot.repositories.find(
      (r) => r.repoKey === finding.repoKey,
    );
    if (!repo) throw new Error("Finding references foreign repository");
    if (!finding.evidence.trim()) throw new Error("Finding evidence missing");
    if (finding.path) {
      if (!snapshot.files[finding.repoKey]?.[finding.path])
        throw new Error("Finding references unknown path");
      const file = safePath(repo.path, finding.path);
      if (
        finding.startLine &&
        finding.startLine > readFileSync(file, "utf8").split("\n").length
      )
        throw new Error("Finding line outside file");
    } else if (finding.startLine !== null)
      throw new Error("Finding line requires path");
  }
  if (
    review.verdict === "pass" &&
    (review.findings.some((f) => f.severity === "P0" || f.severity === "P1") ||
      review.coverageGaps.length)
  )
    throw new Error("Pass contradicts blocking findings or gaps");
  return review;
}
