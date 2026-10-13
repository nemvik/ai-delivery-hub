import type { RunDetail } from "./hub";
import type { RunTab } from "./nav";
import { ACTIVE } from "./labels";

export type StepStatus =
  "done" | "current" | "failed" | "stopped" | "skipped" | "todo";
export interface ProgressStep {
  key: "prepare" | "implement" | "review" | "tests" | "qa" | "verified";
  title: string;
  status: StepStatus;
  note: string;
}

function testsDone(d: RunDetail) {
  const g = d.gates;
  return (
    !!g &&
    g.repoChecks === "passed" &&
    g.integrationQa === "passed" &&
    ["passed", "not_required"].includes(g.nativeQa)
  );
}
function testSummary(d: RunDetail) {
  const current = d.results.filter((r) => r.snapshotId === d.run.snapshotId);
  const qa = current.filter((r) => !r.scenarioId.startsWith("check:"));
  if (!qa.length) return current.length ? `${current.length} checks` : "";
  const counts = new Map<string, number>();
  for (const r of qa) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const order = ["passed", "failed", "blocked", "flaky", "not_run", "skipped"];
  return order
    .filter((s) => counts.get(s))
    .map((s) => `${counts.get(s)} ${s.replace("_", " ")}`)
    .join(", ");
}

/** Derives a simple progress line from the run's recorded facts. */
export function progressSteps(d: RunDetail): ProgressStep[] {
  const { run } = d;
  const mode = run.config.task.mode;
  const hasSnapshot = !!(d.snapshot || run.snapshotId);
  const implementerStarted = d.steps.some((s) => s.role === "implementer");
  const reviewDone = ["passed", "not_required"].includes(d.gates?.review ?? "");
  const steps: (Omit<ProgressStep, "status"> & {
    done: boolean;
    skipped?: boolean;
  })[] = [
    {
      key: "prepare",
      title: "Prepare",
      note: `${run.config.pins.length} ${run.config.pins.length === 1 ? "repository" : "repositories"} pinned`,
      done: hasSnapshot || implementerStarted,
    },
  ];
  if (mode === "implement_review_qa")
    steps.push({
      key: "implement",
      title: "Implementation",
      note: "One writing agent",
      done: hasSnapshot,
    });
  steps.push(
    mode === "qa_only"
      ? {
          key: "review",
          title: "Code review",
          note: "Not part of this run",
          done: true,
          skipped: true,
        }
      : {
          key: "review",
          title: "Code review",
          note: d.reviews.length
            ? `Round ${Math.max(...d.reviews.map((r) => r.round))}`
            : "",
          done: reviewDone,
        },
    { key: "tests", title: "Tests", note: testSummary(d), done: testsDone(d) },
    { key: "qa", title: "Your QA", note: "", done: run.state === "verified" },
    {
      key: "verified",
      title: "Verified",
      note: "",
      done: run.state === "verified",
    },
  );
  const firstOpen = steps.findIndex((s) => !s.done);
  const active = ACTIVE.includes(run.state);
  return steps.map((s, i) => {
    let status: StepStatus = s.skipped ? "skipped" : s.done ? "done" : "todo";
    if (i === firstOpen) {
      if (active || run.state === "awaiting_human_qa") status = "current";
      else if (run.state === "failed") status = "failed";
      else if (run.state !== "verified") status = "stopped";
    }
    let note = s.note;
    if (s.key === "qa" && status === "current") note = "Waiting for you";
    if (s.key === "prepare" && status === "current" && run.state === "queued")
      note = "Waiting in queue";
    return { key: s.key, title: s.title, status, note };
  });
}

export interface NextStep {
  title: string;
  body: string;
  tab?: RunTab;
  action?: "approve" | "retry" | "publish";
  tone: "you" | "info" | "warn" | "bad" | "ok" | "idle";
}

export function nextStep(d: RunDetail): NextStep {
  const { run } = d;
  const stale = run.stale
    ? " The baseline has moved since this run started; start a new run before approving."
    : "";
  switch (run.state) {
    case "queued":
      return {
        title: "Waiting in queue",
        body: run.queueReason
          ? run.queueReason + "."
          : "The worker starts it as soon as a slot is free.",
        tone: "idle",
      };
    case "running": {
      const current = progressSteps(d).find((s) => s.status === "current");
      return {
        title: "Nothing to do yet",
        body: `Working on ${current ? current.title.toLowerCase() : "the run"}. You can leave this page; progress is saved.`,
        tone: "info",
      };
    }
    case "awaiting_human_qa": {
      const manual = run.config.project.scenarios.filter(
        (s) => s.required && s.kind === "manual",
      ).length;
      return {
        title: "Check the evidence and approve this version",
        body:
          "All automatic checks passed." +
          (manual
            ? ` ${manual} manual ${manual === 1 ? "scenario needs" : "scenarios need"} your confirmation.`
            : "") +
          stale,
        tab: "Evidence",
        action: "approve",
        tone: run.stale ? "warn" : "you",
      };
    }
    case "verified": {
      const approval = d.approvals[0];
      return {
        title: "Verified",
        body:
          (approval ? `Approved by ${approval.author}. ` : "") +
          "Verified means this exact version was tested and approved, not that it is deployed.",
        action: "publish",
        tone: "ok",
      };
    }
    case "needs_input": {
      const review = d.reviews[0]?.review;
      const blocking = review?.findings.some(
        (f) => f.severity === "P0" || f.severity === "P1",
      );
      if (review && !blocking)
        return {
          title: "The review is incomplete",
          body: "The reviewer reported missing context or coverage gaps, so the review can’t pass. Provide what’s missing, then retry.",
          tab: "Review",
          tone: "warn",
        };
      return review
        ? {
            title: "Decide on the review findings",
            body: "The review found blocking issues. Accept them and prepare a fix, or record why they don’t apply.",
            tab: "Review",
            tone: "warn",
          }
        : {
            title: "The run needs your input",
            body: run.error || "Check the log for details.",
            tab: "Logs",
            tone: "warn",
          };
    }
    case "failed":
      if (!d.qaFindings.length && d.results.some((r) => r.status === "blocked"))
        return {
          title: "A required test couldn’t run",
          body: "The test environment reported a problem, so the result is blocked, not passed. Fix the environment, then retry.",
          tab: "Tests",
          action: "retry",
          tone: "bad",
        };
      return d.qaFindings.length
        ? {
            title: "Fix the failing tests",
            body: "Some required scenarios failed. Look at the evidence, then prepare a fix run from the findings.",
            tab: "Tests",
            tone: "bad",
          }
        : {
            title: "The run failed",
            body:
              run.error ||
              "Required checks did not pass. The log shows where it stopped.",
            tab: run.error ? "Logs" : "Tests",
            action: "retry",
            tone: "bad",
          };
    case "blocked":
      return {
        title: "The run is blocked",
        body: (
          run.error ||
          run.queueReason ||
          "A requirement is missing."
        ).replace(/^Error:\s*(BLOCKED:\s*)?/, ""),
        action: "retry",
        tone: "warn",
      };
    case "paused":
      return {
        title: "The run is paused",
        body: "Start it again as a new run when you're ready.",
        action: "retry",
        tone: "idle",
      };
    case "interrupted":
      return {
        title: "The worker stopped during this run",
        body: "Make sure no old processes are left, then retry as a new run.",
        tab: "Logs",
        action: "retry",
        tone: "warn",
      };
    default:
      return {
        title: "This run was cancelled",
        body: "Retry it as a new run if you still need it.",
        action: "retry",
        tone: "idle",
      };
  }
}
