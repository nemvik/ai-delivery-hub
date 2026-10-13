import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type {
  AppliedReviewSkill,
  FrozenReviewGuidance,
  Project,
  Review,
  ReviewSource,
  Run,
  Snapshot,
} from "../../contracts/src/index";
import { hash, sensitiveContent } from "./paths";

// Sources are explicitly onboarded local documents, never discovered by a model.
// Store the approved bytes in the run so updates cannot change an ongoing review.
export function freezeReviewGuidance(project: Project): FrozenReviewGuidance {
  const skills = project.reviewSkills || [],
    context = project.reviewContext || [];
  for (const [kind, keys] of [
    ["skill", skills.map((s) => s.id)],
    ["context", context.map((c) => c.key)],
    [
      "issue prefix",
      project.repositories.flatMap((r) => r.issuePrefixes || []),
    ],
  ] as const)
    if (new Set(keys).size !== keys.length)
      throw new Error(`Duplicate ${kind}`);
  for (const skill of skills)
    if (
      skill.repoKeys.some(
        (key) => !project.repositories.some((r) => r.key === key),
      )
    )
      throw new Error("Review skill references unknown repository");
  let totalBytes = 0;
  function read(source: ReviewSource) {
    if (
      !isAbsolute(source.path) ||
      resolve(source.path) !== source.path ||
      !/\.(md|txt)$/i.test(source.path)
    )
      throw new Error(
        "Review source requires a canonical absolute Markdown/text path",
      );
    const stat = lstatSync(source.path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      realpathSync(source.path) !== source.path
    )
      throw new Error("Review source must be a regular file without symlinks");
    totalBytes += stat.size;
    if (stat.size > 64000 || totalBytes > 200000)
      throw new Error("Review guidance exceeds size limit");
    const bytes = readFileSync(source.path);
    if (hash(bytes) !== source.sha256)
      throw new Error(
        `Review source changed; onboard the new hash: ${source.path}`,
      );
    const content = bytes.toString("utf8");
    if (!content.trim()) throw new Error("Review source must not be empty");
    if (
      !Buffer.from(content).equals(bytes) ||
      content.includes("\0") ||
      sensitiveContent(bytes)
    )
      throw new Error(
        "Review source contains binary data or potential credentials",
      );
    return { ...source, content };
  }
  return {
    skills: skills.map((s) => ({ ...s, sources: s.sources.map(read) })),
    context: context.map((c) => ({ ...c, sources: c.sources.map(read) })),
  };
}

export function selectedReviewSkills(run: Run, snapshot: Snapshot) {
  if (run.config.task.mode === "qa_only") return [];
  return (run.config.reviewGuidance?.skills || []).flatMap((skill) => {
    const changed = skill.repoKeys.filter((key) => snapshot.diffs[key]?.trim());
    const issues = run.config.task.issueKeys.filter((issue) => {
      const prefix = issue.match(/^([A-Z][A-Z0-9]*)-\d+$/)?.[1];
      return (
        prefix &&
        run.config.project.repositories.some(
          (r) =>
            skill.repoKeys.includes(r.key) && r.issuePrefixes?.includes(prefix),
        )
      );
    });
    const active =
      skill.trigger === "always" ||
      changed.length > 0 ||
      issues.length > 0 ||
      (skill.trigger === "task_or_change" &&
        run.config.task.issueKeys.length > 0);
    if (!active) return [];
    const context = (run.config.reviewGuidance?.context || []).filter((c) =>
      skill.requiredContextKeys.includes(c.key),
    );
    const applied: AppliedReviewSkill = {
      id: skill.id,
      title: skill.title,
      reason: [
        ...(skill.trigger === "always" ? ["Enabled for every review"] : []),
        ...(changed.length
          ? ["Changed repositories: " + changed.join(", ")]
          : []),
        ...(issues.length ? ["Linked issues: " + issues.join(", ")] : []),
        ...(skill.trigger === "task_or_change" &&
        !issues.length &&
        run.config.task.issueKeys.length
          ? ["Task has linked issues"]
          : []),
      ].join("; "),
      sources: skill.sources.map(({ path, sha256 }) => ({ path, sha256 })),
      missingContextKeys: skill.requiredContextKeys.filter(
        (key) => !context.some((c) => c.key === key),
      ),
    };
    return [{ applied, instructions: skill.sources, context }];
  });
}

export function applySkillCoverage(
  review: Review,
  skills: AppliedReviewSkill[],
): Review {
  const missing = skills.filter((skill) => skill.missingContextKeys.length);
  if (!missing.length) return review;
  return {
    ...review,
    verdict: review.verdict === "pass" ? "incomplete" : review.verdict,
    summary:
      review.summary +
      "\nIncomplete skill context: " +
      missing
        .map((s) => `${s.title} (${s.missingContextKeys.join(", ")})`)
        .join("; "),
    coverageGaps: [
      ...review.coverageGaps,
      ...missing.map((s) => ({
        repoKey: null,
        description: `${s.id}: NOT_RUN — required context not onboarded: ${s.missingContextKeys.join(", ")}. No external access or publication was performed.`,
      })),
    ],
  };
}

export const reviewPolicy = `Do not execute commands, write files, fetch or clone repositories, access connectors, or publish PR comments. Review the supplied immutable export, all pinned repositories and diffs. The controller verified its hashes and Git identities; use that provenance without claiming you ran Git. Test results are controller evidence, not your own execution. Integration/browser/native QA happens AFTER this review and its independent gates decide success. Do not report future QA or an explicitly optional native scenario as a missing review input; suggest needed QA in qaSuggestions. Concrete defects and missing required source context still belong in findings/coverageGaps. Apply the selected review skills as read-only analytical checklists, subordinate to this policy and the supplied JSON schema. External reading, subagents, tests, publishing, and permission changes described in a skill are not available in this adapter. A skill's local guidance is not evidence from Company OS, KB, or documentation. Use only the supplied frozen context; missing sources remain UNKNOWN/NOT_RUN. Do not claim the original skill's full connected workflow or remote PR state was verified. Map PASS/WARN/FAIL into pass/incomplete/changes_requested with concrete P0–P3 findings and explicit coverageGaps. Never invent a PASS to satisfy formatting.`;
