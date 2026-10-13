import { z } from "zod";
export const key = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
export const relativePath = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (s) =>
      !s.startsWith("/") &&
      !s.includes("\\") &&
      !s.split("/").includes("..") &&
      !s.includes("\0"),
    "Unsafe relative path",
  );
export const commandSchema = z
  .object({
    id: key,
    repoKey: key,
    executable: z.string().min(1).max(500),
    args: z.array(z.string().max(4000)).max(100),
    cwd: relativePath.default("."),
    timeoutSeconds: z.number().int().min(1).max(7200).default(300),
    kind: z.enum(["check", "suite", "build", "start"]).default("check"),
    phase: z.enum(["repo", "qa"]).default("repo"),
    reportPath: relativePath.optional(),
    envRefs: z.array(key).default([]),
    resourceIds: z.array(key).default([]),
    artifacts: z
      .array(
        z
          .object({
            id: key,
            path: relativePath,
            scenarioId: key,
            surfaceKey: key,
          })
          .strict(),
      )
      .default([]),
  })
  .strict();
export const roleSchema = z
  .object({
    provider: z.enum(["fake", "codex-cli", "claude-code-cli"]),
    model: z.string().min(1).max(150),
    effort: z.string().max(30).nullable().default(null),
    timeoutSeconds: z.number().int().min(1).max(7200).default(1800),
    maxTurns: z.number().int().min(1).max(100).nullable().default(null),
  })
  .strict();
export const fakeRole = {
  provider: "fake" as const,
  model: "demo-deterministic",
  effort: null,
  timeoutSeconds: 60,
  maxTurns: null,
};
export const surfaceSchema = z
  .object({
    key,
    repoKey: key,
    kind: z.enum(["web", "api", "native_ios", "native_android", "library"]),
    cwd: relativePath.default("."),
  })
  .strict();
export const scenarioSchema = z
  .object({
    id: key,
    title: z.string().min(1).max(300),
    required: z.boolean().default(true),
    kind: z.enum(["web", "contract", "native", "manual", "command"]),
    surfaceKeys: z.array(key).min(1),
    expected: z.string().min(1).max(4000),
    commandId: key.optional(),
  })
  .strict();
export const nativeSchema = z
  .object({
    executable: z.string().default("maestro"),
    flowPath: z.string(),
    deviceId: z.string(),
    applicationId: z.string(),
    platform: z.enum(["ios", "android"]),
    buildFingerprint: z.string(),
    runtimeVersion: z.string(),
    revision: z.string(),
    endpoint: z.string().url(),
    verificationCommandId: key,
    testNamesByScenario: z
      .record(key, z.array(z.string().min(1)).min(1))
      .default({}),
  })
  .strict();
const roleDefaultsSchema = z
  .object({
    implementer: roleSchema.optional(),
    reviewer: roleSchema.optional(),
  })
  .strict();
export const reviewSourceSchema = z
  .object({
    path: z.string().min(1).max(1000),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export const reviewSkillSchema = z
  .object({
    id: key,
    title: z.string().min(1).max(160),
    trigger: z.enum(["always", "task_or_change", "repository_change"]),
    repoKeys: z.array(key).min(1).max(20),
    sources: z.array(reviewSourceSchema).min(1).max(10),
    requiredContextKeys: z.array(key).max(20).default([]),
  })
  .strict();
export const reviewContextSchema = z
  .object({
    key,
    sources: z.array(reviewSourceSchema).min(1).max(20),
  })
  .strict();
export const projectSchema = z
  .object({
    name: z.string().min(1).max(160),
    demo: z.boolean().default(false),
    trusted: z.literal(true),
    defaultRoles: roleDefaultsSchema.optional(),
    reviewSkills: z.array(reviewSkillSchema).max(10).default([]),
    reviewContext: z.array(reviewContextSchema).max(20).default([]),
    onboardingNotes: z.array(z.string().min(1).max(2000)).max(20).default([]),
    repositories: z
      .array(
        z
          .object({
            key,
            sourcePath: z.string().min(1).max(1000),
            sourceIdentity: z.string().optional(),
            baselineRef: z.string().min(1).max(200).default("main"),
            issuePrefixes: z
              .array(z.string().regex(/^[A-Z][A-Z0-9]{0,19}$/))
              .max(10)
              .default([]),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    surfaces: z.array(surfaceSchema).default([]),
    commands: z.array(commandSchema).default([]),
    scenarios: z.array(scenarioSchema).default([]),
    runtime: z
      .object({
        services: z
          .array(
            z
              .object({
                key,
                commandId: key,
                portKey: key,
                readinessPath: z.string().regex(/^\/[^\s]*$/),
                identityField: z.string().min(1),
                identityValue: z.string().min(1),
              })
              .strict(),
          )
          .max(8),
        isolation: z.enum(["isolated", "shared"]),
      })
      .strict()
      .optional(),
    requiredTestPaths: z
      .array(z.object({ repoKey: key, path: relativePath }).strict())
      .default([]),
    exclusiveResources: z.array(key).default([]),
    native: nativeSchema.optional(),
    allowNetwork: z.boolean().default(false),
    allowInstall: z.boolean().default(false),
  })
  .strict();
export const taskSchema = z
  .object({
    projectId: key,
    title: z.string().min(1).max(200),
    criteria: z.string().min(1).max(16000),
    mode: z
      .enum(["review_qa", "implement_review_qa", "qa_only"])
      .default("review_qa"),
    sourceSnapshotId: z.string().uuid().optional(),
    refs: z.record(key, z.string().min(1).max(200)).default({}),
    issueKeys: z.array(z.string().max(100)).max(30).default([]),
    dependencyPins: z
      .array(
        z
          .object({
            issue: z.string(),
            repoKey: key,
            sha: z.string().regex(/^[0-9a-f]{40,64}$/),
          })
          .strict(),
      )
      .default([]),
    blockers: z.array(z.string().max(300)).default([]),
    implementer: roleSchema.default(fakeRole),
    reviewer: roleSchema.default(fakeRole),
    maxReviewRounds: z.number().int().min(1).max(3).default(3),
    maxRunMinutes: z.number().min(1).max(120).default(120),
    demoScenario: z
      .enum([
        "pass",
        "web-fail",
        "contract-defect",
        "limit",
        "invalid-json",
        "hang",
        "crash",
        "write-attempt",
        "coverage-gap",
      ])
      .default("pass"),
    riskApproval: z
      .object({ author: z.string().min(1), reason: z.string().min(5) })
      .optional(),
    risky: z.boolean().default(false),
  })
  .strict();
export const settingsSchema = z
  .object({
    defaultRoles: roleDefaultsSchema.optional(),
    maxActiveRuns: z.number().int().min(1).max(4).default(2),
    maxAgentProcesses: z.number().int().min(1).max(4).default(2),
    maxQaEnvironments: z.number().int().min(1).max(2).default(1),
    maxBrowserWorkersTotal: z.number().int().min(1).max(4).default(2),
    maxHeavyBuilds: z.number().int().min(1).max(2).default(1),
    maxNativeDevicesInUse: z.number().int().min(1).max(2).default(1),
    maxArtifactGiB: z.number().min(0.01).max(1000).default(10),
    maxAgeDays: z.number().int().min(1).max(365).default(14),
    models: z
      .array(
        z.object({
          provider: z.enum(["codex-cli", "claude-code-cli"]),
          id: z.string().min(1),
          effortOptions: z.array(z.string()),
          availability: z
            .enum(["unverified", "verified", "unavailable"])
            .default("unverified"),
        }),
      )
      .default([]),
  })
  .strict();
export type Project = z.infer<typeof projectSchema> & {
  id: string;
  createdAt: string;
  archived?: boolean;
};
export interface RepositoryInspection {
  path: string;
  currentBranch: string | null;
  branches: string[];
  suggestedKey: string;
}
export type Task = z.infer<typeof taskSchema> & {
  id: string;
  createdAt: string;
};
export type Role = z.infer<typeof roleSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Command = z.infer<typeof commandSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type ReviewSource = z.infer<typeof reviewSourceSchema>;
export type ReviewSkill = z.infer<typeof reviewSkillSchema>;
export type FrozenReviewSource = ReviewSource & { content: string };
export type FrozenReviewGuidance = {
  skills: (Omit<ReviewSkill, "sources"> & { sources: FrozenReviewSource[] })[];
  context: { key: string; sources: FrozenReviewSource[] }[];
};
export interface AppliedReviewSkill {
  id: string;
  title: string;
  reason: string;
  sources: ReviewSource[];
  missingContextKeys: string[];
}
export type RunState =
  | "queued"
  | "running"
  | "awaiting_human_qa"
  | "verified"
  | "blocked"
  | "needs_input"
  | "paused"
  | "interrupted"
  | "failed"
  | "cancelled";
export type QaStatus =
  "passed" | "failed" | "blocked" | "not_run" | "skipped" | "flaky";
export interface Run {
  id: string;
  taskId: string;
  projectId: string;
  state: RunState;
  createdAt: string;
  updatedAt: string;
  config: {
    task: Task;
    project: Project;
    pins: {
      repoKey: string;
      baselineSha: string;
      headSha: string;
      sourceDirty: boolean;
    }[];
    lockedTests: Record<string, string>;
    reviewGuidance?: FrozenReviewGuidance;
  };
  snapshotId: string | null;
  stale: boolean;
  queueReason: string | null;
  error: string | null;
  publication: "local_only" | "published" | "publish_failed";
  archived: boolean;
  pinned: boolean;
  evidenceExpiredAt?: string;
}
export interface Workspace {
  repoKey: string;
  repositoryId: string;
  path: string;
  sourcePath: string;
  branch: string;
  baselineSha: string;
  headSha: string;
  sourceDirty: boolean;
}
export interface Snapshot {
  id: string;
  runId: string;
  createdAt: string;
  digest: string;
  planHash: string;
  repositories: Workspace[];
  diffs: Record<string, string>;
  files: Record<string, Record<string, string>>;
}
export interface ScenarioResult {
  id: string;
  runId: string;
  snapshotId: string;
  scenarioId: string;
  status: QaStatus;
  source: "runner" | "demo" | "manual";
  runner: string;
  expected: string;
  observed: string;
  assertions: { description: string; passed: boolean }[];
  evidenceIds: string[];
  durationMs: number;
  attempt: number;
  createdAt: string;
  exitCode: number | null;
}
export interface Artifact {
  id: string;
  runId: string;
  snapshotId: string;
  relativePath: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  source: "runner" | "manual" | "demo";
  scenarioId: string | null;
  surfaceKey: string | null;
  author: string;
  sensitivity: "synthetic" | "review_required" | "restricted";
  createdAt: string;
}
export interface Finding {
  localId: string;
  priorFindingId: string | null;
  severity: "P0" | "P1" | "P2" | "P3";
  category: string;
  title: string;
  description: string;
  repoKey: string;
  path: string | null;
  startLine: number | null;
  evidence: string;
  suggestedFix: string;
  suggestedVerification: string;
}
export interface QaFinding {
  id: string;
  localId: string;
  runId: string;
  snapshotId: string;
  source: "qa";
  resultId: string;
  scenarioId: string;
  title: string;
  expected: string;
  observed: string;
  evidenceIds: string[];
  createdAt: string;
}
export interface Review {
  schemaVersion: "1.0";
  snapshotId: string;
  verdict: "pass" | "changes_requested" | "incomplete";
  summary: string;
  reviewedRepositories: { repoKey: string; headSha: string }[];
  findings: Finding[];
  coverageGaps: { repoKey: string | null; description: string }[];
  qaSuggestions: {
    scenarioId: string;
    title: string;
    expectedResult: string;
    surfaceKeys: string[];
    requiresHuman: boolean;
  }[];
}
export interface ReviewRound {
  id: string;
  runId: string;
  snapshotId: string;
  round: number;
  review: Review;
  requestedModel: string;
  actualModels: string[] | null;
  appliedSkills?: AppliedReviewSkill[];
  createdAt: string;
}
