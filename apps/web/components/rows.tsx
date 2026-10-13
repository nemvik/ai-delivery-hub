"use client";
import type { Project, Run, Task } from "../../../packages/contracts/src/index";
import { MODE_LABELS, timeAgo, duration } from "../lib/labels";
import { DemoTag, Pill, RunPill } from "./ui";

function repoSummary(keys: string[]) {
  if (keys.length <= 3) return keys.join(", ");
  return `${keys.length} repositories`;
}

export function RunRow({
  run,
  project,
  showProject,
  onOpen,
}: {
  run: Run;
  project?: Project;
  showProject: boolean;
  onOpen: () => void;
}) {
  const task = run.config.task;
  const repos = run.config.project.repositories.map((r) => r.key);
  const when =
    run.state === "running"
      ? `Running for ${duration(run.createdAt)}`
      : run.state === "queued"
        ? run.queueReason || "Waiting in queue"
        : `Updated ${timeAgo(run.updatedAt)}`;
  return (
    <button className="list-row run-row" onClick={onOpen} data-run={run.id}>
      <RunPill state={run.state} />
      <span>
        <span className="row-title">{task.title}</span>
        <span className="row-meta">
          {showProject && project && <span>{project.name}</span>}
          <span>{MODE_LABELS[task.mode].short}</span>
          <span>{repoSummary(repos)}</span>
          <span>{when}</span>
          {run.stale && (
            <span className="nowrap" style={{ color: "var(--warn)" }}>
              Baseline moved
            </span>
          )}
          {run.archived && <span>Archived</span>}
        </span>
      </span>
      <span className="row-side">
        {run.config.project.demo && <DemoTag />}
        <span className="btn btn-sm">Open</span>
      </span>
    </button>
  );
}

export function TaskRow({
  task,
  project,
  latest,
  showProject,
  busy,
  onStart,
  onOpenRun,
}: {
  task: Task;
  project?: Project;
  latest?: Run;
  showProject: boolean;
  busy: boolean;
  onStart: () => void;
  onOpenRun: (id: string) => void;
}) {
  const archived = !!project?.archived;
  return (
    <div className="list-row task-row" data-task={task.id}>
      {latest ? (
        <RunPill state={latest.state} />
      ) : (
        <span className="row-status">
          <Pill tone="idle" icon="clock">
            Not started
          </Pill>
        </span>
      )}
      <span>
        <span className="row-title">{task.title}</span>
        <span className="row-meta">
          {showProject && project && <span>{project.name}</span>}
          <span>{MODE_LABELS[task.mode].short}</span>
          {task.issueKeys.length > 0 && (
            <span>{task.issueKeys.join(", ")}</span>
          )}
          {task.sourceSnapshotId && <span>Continues an earlier run</span>}
          <span>Saved {timeAgo(task.createdAt)}</span>
        </span>
      </span>
      <span className="row-side">
        {project?.demo && <DemoTag />}
        {latest && (
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => onOpenRun(latest.id)}
          >
            Open last run
          </button>
        )}
        <button
          className={"btn btn-sm" + (latest ? "" : " btn-primary")}
          disabled={busy || archived}
          title={archived ? "Restore the project to start runs" : undefined}
          onClick={onStart}
        >
          {latest ? "Run again" : "Start run"}
        </button>
      </span>
    </div>
  );
}

/** Latest run per task, so superseded attempts don't ask for attention. */
export function latestRuns(runs: Run[]) {
  const byTask = new Map<string, Run>();
  for (const r of runs) {
    const prev = byTask.get(r.taskId);
    if (!prev || prev.createdAt < r.createdAt) byTask.set(r.taskId, r);
  }
  return byTask;
}
