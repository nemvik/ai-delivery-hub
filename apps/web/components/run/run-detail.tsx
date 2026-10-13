"use client";
import { useEffect, useState } from "react";
import type { Project, Task } from "../../../../packages/contracts/src/index";
import type { DestinationView, Hub, RunDetail as Detail } from "../../lib/hub";
import { RUN_TABS, type RunTab } from "../../lib/nav";
import { ACTIVE, MODE_LABELS, PROVIDER_LABELS } from "../../lib/labels";
import { nextStep, progressSteps } from "../../lib/run-progress";
import { DemoTag, Icon, RunPill } from "../ui";
import { OverviewTab } from "./overview-tab";
import { ChangesTab } from "./changes-tab";
import { ReviewTab } from "./review-tab";
import { TestsTab } from "./tests-tab";
import { EvidenceTab } from "./evidence-tab";
import { LogsTab } from "./logs-tab";

const RETRYABLE = [
  "failed",
  "blocked",
  "interrupted",
  "paused",
  "cancelled",
  "needs_input",
];
const ARCHIVABLE = [
  "verified",
  "failed",
  "cancelled",
  "blocked",
  "needs_input",
];

export function RunDetailView({
  detail,
  project,
  hub,
  destinations,
  tab,
  setTab,
  onBack,
  onPrepareFix,
  onOpenSettings,
  onOpenRun,
}: {
  detail: Detail;
  project?: Project;
  hub: Hub;
  destinations: DestinationView[];
  tab: RunTab;
  setTab: (tab: RunTab) => void;
  onBack: () => void;
  onPrepareFix: (seed: Partial<Task>) => void;
  onOpenSettings: () => void;
  onOpenRun: (id: string) => void;
}) {
  const { run } = detail;
  const task = run.config.task;
  const act = (action: string, extra: object = {}) =>
    hub.mutate(`runs/${run.id}/actions`, { action, ...extra });
  // The worker creates the retry run asynchronously. Follow only a run that
  // didn't exist when Retry was clicked, and say so if none appears.
  const [retrying, setRetrying] = useState<{
    known: string[];
    at: number;
  } | null>(null);
  useEffect(() => {
    if (!retrying) return;
    const created = hub.state.runs.find(
      (r) => r.taskId === run.taskId && !retrying.known.includes(r.id),
    );
    if (created) {
      setRetrying(null);
      hub.setNotice("");
      onOpenRun(created.id);
    } else if (Date.now() - retrying.at > 20000) {
      setRetrying(null);
      hub.setNotice("");
      hub.setError(
        "No new run started. This run may already have been retried, or the worker refused it; the log says why.",
      );
    }
  }, [retrying, hub, run.taskId, onOpenRun]);
  const archivedProject = !!project?.archived;
  const retry = async () => {
    const known = hub.state.runs
      .filter((r) => r.taskId === run.taskId)
      .map((r) => r.id);
    if (await act("retry")) {
      setRetrying({ known, at: Date.now() });
      hub.setNotice("Starting a new run with the same task…");
    }
  };
  const next = nextStep(detail);
  const steps = progressSteps(detail);
  const active = ACTIVE.includes(run.state);
  const reviewer =
    task.mode === "qa_only"
      ? null
      : `${PROVIDER_LABELS[task.reviewer.provider]} · ${task.reviewer.model}`;
  const counts: Partial<Record<RunTab, { n: number; alert?: boolean }>> = {
    Review: {
      n: detail.reviews[0]?.review.findings.length ?? 0,
      alert: !!detail.reviews[0]?.review.findings.some(
        (f) => f.severity === "P0" || f.severity === "P1",
      ),
    },
    Tests: {
      n: detail.results.filter(
        (r) =>
          r.snapshotId === run.snapshotId && !r.scenarioId.startsWith("check:"),
      ).length,
      alert: detail.qaFindings.length > 0,
    },
    Evidence: { n: detail.artifacts.length },
  };
  const focusApprove = () => {
    setTab("Overview");
    setTimeout(() => {
      const el = document.getElementById("approve-author");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus({ preventScroll: true });
    }, 50);
  };
  return (
    <>
      <div className="run-head">
        <div className="crumb">
          <button onClick={onBack}>
            <Icon name="chevronLeft" /> Runs
          </button>
          {project && <span>/ {project.name}</span>}
        </div>
        <div className="title-row">
          <h1 className="page-title">{task.title}</h1>
          <RunPill state={run.state} />
          {run.config.project.demo && <DemoTag />}
          <div className="head-actions">
            {active && (
              <>
                <button
                  className="btn btn-sm"
                  disabled={hub.busy}
                  onClick={() => void act("pause")}
                >
                  Pause run
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  disabled={hub.busy}
                  onClick={() => void act("cancel")}
                >
                  Cancel run
                </button>
              </>
            )}
            {RETRYABLE.includes(run.state) && (
              <button
                className="btn btn-sm"
                disabled={hub.busy || !!retrying || archivedProject}
                title={
                  archivedProject
                    ? "Restore the project to start runs"
                    : undefined
                }
                onClick={() => void retry()}
              >
                Retry as new run
              </button>
            )}
          </div>
        </div>
        <div className="meta-line">
          <span>{MODE_LABELS[task.mode].title}</span>
          <span>Started {new Date(run.createdAt).toLocaleString()}</span>
          <span>
            {run.config.pins.length}{" "}
            {run.config.pins.length === 1 ? "repository" : "repositories"}
          </span>
          {reviewer && <span>Reviewer {reviewer}</span>}
          {run.archived && <span>Archived</span>}
        </div>
      </div>

      <div className="next" data-tone={next.tone} role="status">
        <div className="grow">
          <h2>{next.title}</h2>
          <p>{next.body}</p>
        </div>
        <div className="row">
          {next.tab && next.tab !== tab && (
            <button
              className={"btn" + (next.action ? "" : " btn-primary")}
              onClick={() => setTab(next.tab!)}
            >
              {next.tab === "Evidence"
                ? "Open evidence"
                : next.tab === "Review"
                  ? "Open review"
                  : next.tab === "Tests"
                    ? "Open test results"
                    : "Open log"}
            </button>
          )}
          {next.action === "approve" && (
            <button className="btn btn-primary" onClick={focusApprove}>
              Approve…
            </button>
          )}
          {next.action === "retry" && (
            <button
              className="btn btn-primary"
              disabled={hub.busy || !!retrying || archivedProject}
              title={
                archivedProject
                  ? "Restore the project to start runs"
                  : undefined
              }
              onClick={() => void retry()}
            >
              Retry as new run
            </button>
          )}
        </div>
      </div>

      <ol className="progress" aria-label="Progress">
        {steps.map((s, i) => (
          <li
            key={s.key}
            className={s.status}
            aria-current={s.status === "current" ? "step" : undefined}
          >
            <span className="marker">
              {s.status === "done" ? (
                <Icon name="check" />
              ) : s.status === "failed" ? (
                <Icon name="x" />
              ) : s.status === "skipped" ? (
                <Icon name="minus" />
              ) : s.status === "stopped" ? (
                "!"
              ) : (
                i + 1
              )}
            </span>
            <b>{s.title}</b>
            <small>
              {s.status === "skipped" ? "Not part of this run" : s.note || " "}
            </small>
          </li>
        ))}
      </ol>

      <div className="tabs" role="tablist" aria-label="Run details">
        {RUN_TABS.map((t) => (
          <button
            key={t}
            role="tab"
            className="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
          >
            {t}
            {!!counts[t]?.n && (
              <span
                className={"badge-count" + (counts[t]!.alert ? " alert" : "")}
              >
                {counts[t]!.n}
              </span>
            )}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={tab}>
        {tab === "Overview" && (
          <OverviewTab
            detail={detail}
            hub={hub}
            destinations={destinations}
            onOpenSettings={onOpenSettings}
            onShowLogs={() => setTab("Logs")}
            act={act}
            canArchive={!run.archived && ARCHIVABLE.includes(run.state)}
          />
        )}
        {tab === "Changes" && <ChangesTab detail={detail} />}
        {tab === "Review" && (
          <ReviewTab detail={detail} hub={hub} onPrepareFix={onPrepareFix} />
        )}
        {tab === "Tests" && (
          <TestsTab
            detail={detail}
            home={hub.state.home}
            onPrepareFix={onPrepareFix}
          />
        )}
        {tab === "Evidence" && <EvidenceTab detail={detail} hub={hub} />}
        {tab === "Logs" && <LogsTab detail={detail} home={hub.state.home} />}
      </div>
    </>
  );
}
