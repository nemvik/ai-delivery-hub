import type {
  RunState,
  QaStatus,
  Task,
  Settings,
  Role,
} from "../../../packages/contracts/src/index";

export type Tone = "ok" | "warn" | "bad" | "info" | "idle" | "you";
export type IconName =
  | "check"
  | "x"
  | "alert"
  | "clock"
  | "dot"
  | "pause"
  | "ban"
  | "zap"
  | "minus"
  | "target";
export interface StatusLabel {
  label: string;
  icon: IconName;
  tone: Tone;
}
export interface RunStatusLabel extends StatusLabel {
  whoseTurn: "you" | "system" | "done" | "nobody";
}

const RUN_STATUS: Record<RunState, RunStatusLabel> = {
  queued: {
    label: "Waiting in queue",
    icon: "clock",
    tone: "idle",
    whoseTurn: "system",
  },
  running: { label: "Running", icon: "dot", tone: "info", whoseTurn: "system" },
  awaiting_human_qa: {
    label: "Ready for your QA",
    icon: "target",
    tone: "you",
    whoseTurn: "you",
  },
  verified: { label: "Verified", icon: "check", tone: "ok", whoseTurn: "done" },
  blocked: { label: "Blocked", icon: "ban", tone: "warn", whoseTurn: "you" },
  needs_input: {
    label: "Needs your input",
    icon: "alert",
    tone: "warn",
    whoseTurn: "you",
  },
  paused: { label: "Paused", icon: "pause", tone: "idle", whoseTurn: "you" },
  interrupted: {
    label: "Interrupted",
    icon: "zap",
    tone: "warn",
    whoseTurn: "you",
  },
  failed: { label: "Failed", icon: "x", tone: "bad", whoseTurn: "you" },
  cancelled: {
    label: "Cancelled",
    icon: "minus",
    tone: "idle",
    whoseTurn: "nobody",
  },
};
export const runStatus = (state: RunState): RunStatusLabel =>
  RUN_STATUS[state] ?? {
    label: state,
    icon: "minus",
    tone: "idle",
    whoseTurn: "nobody",
  };
export const NEEDS_YOU: RunState[] = [
  "awaiting_human_qa",
  "needs_input",
  "blocked",
  "failed",
  "interrupted",
  "paused",
];
export const ACTIVE: RunState[] = ["queued", "running"];

const QA_STATUS: Record<QaStatus, StatusLabel> = {
  passed: { label: "Passed", icon: "check", tone: "ok" },
  failed: { label: "Failed", icon: "x", tone: "bad" },
  blocked: { label: "Blocked", icon: "ban", tone: "warn" },
  not_run: { label: "Not run", icon: "minus", tone: "idle" },
  skipped: { label: "Skipped", icon: "minus", tone: "idle" },
  flaky: { label: "Flaky", icon: "alert", tone: "warn" },
};
export const qaStatus = (s: QaStatus): StatusLabel =>
  QA_STATUS[s] ?? { label: s, icon: "minus", tone: "idle" };

const GATE_STATUS: Record<string, StatusLabel> = {
  passed: { label: "Passed", icon: "check", tone: "ok" },
  failed: { label: "Failed", icon: "x", tone: "bad" },
  not_required: { label: "Not required", icon: "minus", tone: "idle" },
  not_configured: { label: "Not configured", icon: "alert", tone: "warn" },
  required: { label: "Waiting for you", icon: "target", tone: "you" },
  pending: { label: "Not done yet", icon: "clock", tone: "idle" },
  not_reached: { label: "Not reached", icon: "minus", tone: "idle" },
  none_configured: { label: "None configured", icon: "alert", tone: "warn" },
};
export const gateStatus = (s: string): StatusLabel =>
  GATE_STATUS[s] ?? {
    label: s.replaceAll("_", " "),
    icon: "minus",
    tone: "idle",
  };

export const GATE_LABELS = {
  repoChecks: {
    title: "Repository checks",
    help: "Lint, types, unit tests and builds from the project's commands.",
  },
  review: {
    title: "Code review",
    help: "Independent read-only review of the exact version.",
  },
  integrationQa: {
    title: "Web & integration tests",
    help: "Required scenarios run against the started product.",
  },
  nativeQa: {
    title: "Mobile app tests",
    help: "Configured Maestro flows on a prepared device.",
  },
  evidenceIntegrity: {
    title: "Evidence integrity",
    help: "Every screenshot and report matches its recorded hash.",
  },
  humanApproval: {
    title: "Your approval",
    help: "A person confirms this exact version.",
  },
} as const;
export type GateKey = keyof typeof GATE_LABELS;

const VERDICT: Record<string, StatusLabel> = {
  pass: { label: "No blocking issues", icon: "check", tone: "ok" },
  changes_requested: {
    label: "Changes requested",
    icon: "alert",
    tone: "warn",
  },
  incomplete: { label: "Incomplete review", icon: "ban", tone: "warn" },
};
export const verdictStatus = (v: string): StatusLabel =>
  VERDICT[v] ?? { label: v, icon: "minus", tone: "idle" };

const SEVERITY: Record<string, StatusLabel & { meaning: string }> = {
  P0: {
    label: "P0 · Critical",
    icon: "x",
    tone: "bad",
    meaning: "Blocks approval",
  },
  P1: {
    label: "P1 · High",
    icon: "alert",
    tone: "bad",
    meaning: "Blocks approval",
  },
  P2: {
    label: "P2 · Medium",
    icon: "alert",
    tone: "warn",
    meaning: "Visible caveat",
  },
  P3: { label: "P3 · Note", icon: "minus", tone: "idle", meaning: "Note" },
};
export const severityStatus = (p: string) =>
  SEVERITY[p] ?? {
    label: p,
    icon: "minus" as IconName,
    tone: "idle" as Tone,
    meaning: "",
  };

export const DECISIONS: Record<string, string> = {
  dispute: "Disputed",
  false_positive: "Marked as false positive",
  accept_risk: "Risk accepted",
};

export const MODE_LABELS: Record<
  Task["mode"],
  { title: string; short: string; description: string }
> = {
  review_qa: {
    title: "Review + QA",
    short: "Review + QA",
    description: "Checks finished work. Never changes code.",
  },
  implement_review_qa: {
    title: "Implement + review + QA",
    short: "Implement + review",
    description: "One agent writes the change, another reviews it.",
  },
  qa_only: {
    title: "Tests only",
    short: "Tests only",
    description: "Re-runs tests on a version. No AI.",
  },
};
export const MODE_ORDER: Task["mode"][] = [
  "review_qa",
  "implement_review_qa",
  "qa_only",
];

export const PROVIDER_LABELS: Record<Role["provider"], string> = {
  "codex-cli": "Codex",
  "claude-code-cli": "Claude Code",
  fake: "DEMO provider",
};

export type CapacityKey = Exclude<keyof Settings, "models" | "defaultRoles">;
export const CAPACITY_FIELDS: {
  key: CapacityKey;
  label: string;
  help: string;
  min: number;
  max: number;
}[] = [
  {
    key: "maxActiveRuns",
    label: "Runs at the same time",
    help: "Other runs wait in the queue.",
    min: 1,
    max: 4,
  },
  {
    key: "maxAgentProcesses",
    label: "AI agents at once",
    help: "Implementers and reviewers together.",
    min: 1,
    max: 4,
  },
  {
    key: "maxQaEnvironments",
    label: "Test environments at once",
    help: "Raise to 2 only after checking isolation and memory.",
    min: 1,
    max: 2,
  },
  {
    key: "maxBrowserWorkersTotal",
    label: "Browser test workers",
    help: "Shared by all runs.",
    min: 1,
    max: 4,
  },
  {
    key: "maxHeavyBuilds",
    label: "Builds at once",
    help: "Builds are slow and memory hungry.",
    min: 1,
    max: 2,
  },
  {
    key: "maxNativeDevicesInUse",
    label: "Mobile devices at once",
    help: "Simulators and phones used for app tests.",
    min: 1,
    max: 2,
  },
];
export const STORAGE_FIELDS: {
  key: CapacityKey;
  label: string;
  help: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}[] = [
  {
    key: "maxAgeDays",
    label: "Keep evidence for",
    help: "Only approved, archived runs are ever cleaned up.",
    min: 1,
    max: 365,
    step: 1,
    unit: "days",
  },
  {
    key: "maxArtifactGiB",
    label: "Evidence storage limit",
    help: "New runs wait when the limit is reached.",
    min: 0.01,
    max: 1000,
    step: 0.5,
    unit: "GB",
  },
];

export const SURFACE_KINDS = [
  { value: "web", label: "Web app" },
  { value: "api", label: "API" },
  { value: "native_ios", label: "iOS app" },
  { value: "native_android", label: "Android app" },
  { value: "library", label: "Library" },
] as const;
export const COMMAND_KINDS = [
  {
    value: "check",
    label: "Check",
    help: "Pass or fail from the exit code (lint, typecheck, unit tests).",
  },
  {
    value: "suite",
    label: "Test suite",
    help: "Writes a result report the hub reads scenario by scenario.",
  },
  {
    value: "build",
    label: "Build",
    help: "Heavy step; only a limited number run at once.",
  },
  {
    value: "start",
    label: "Start service",
    help: "Starts a service for QA, e.g. a backend on a reserved port.",
  },
] as const;
export const COMMAND_PHASES = [
  { value: "repo", label: "Repository checks" },
  { value: "qa", label: "QA" },
] as const;
export const SCENARIO_KINDS = [
  { value: "web", label: "Web" },
  { value: "contract", label: "API contract" },
  { value: "command", label: "Command" },
  { value: "native", label: "Mobile app" },
  { value: "manual", label: "Manual check" },
] as const;
export const SKILL_TRIGGERS: Record<string, string> = {
  always: "Every review",
  task_or_change: "Linked issue or changed repository",
  repository_change: "Changed repository",
};

export const PLACEHOLDERS = [
  "{{run.id}}",
  "{{snapshot.id}}",
  "{{paths.worktree}}",
  "{{paths.runtime}}",
  "{{ports.backend}}",
];

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return d === 1 ? "yesterday" : `${d} days ago`;
  return new Date(iso).toLocaleDateString();
}
export function duration(fromIso: string, toIso?: string) {
  const ms =
    (toIso ? new Date(toIso).getTime() : Date.now()) -
    new Date(fromIso).getTime();
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
export const shortPath = (path: string, home?: string | null) =>
  home && path.startsWith(home + "/") ? "~" + path.slice(home.length) : path;
export const bytes = (n: number) =>
  n < 1024 ** 2
    ? `${Math.round(n / 1024)} KB`
    : n < 1024 ** 3
      ? `${(n / 1024 ** 2).toFixed(1)} MB`
      : `${(n / 1024 ** 3).toFixed(2)} GB`;
