"use client";
import { useState } from "react";
import type { Project, Run, Task } from "../../../packages/contracts/src/index";
import { ACTIVE, NEEDS_YOU } from "../lib/labels";
import { EmptyState } from "./ui";
import { RunRow, TaskRow, latestRuns } from "./rows";

export function TasksView({
  scopeLabel,
  showProject,
  projects,
  tasks,
  runs,
  busy,
  canCreateTask,
  onStart,
  onOpenRun,
  onNewTask,
}: {
  scopeLabel: string;
  showProject: boolean;
  projects: Project[];
  tasks: Task[];
  runs: Run[];
  busy: boolean;
  canCreateTask: boolean;
  onStart: (task: Task) => void;
  onOpenRun: (id: string) => void;
  onNewTask: () => void;
}) {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const latest = latestRuns(runs);
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-sub">
            {scopeLabel}. A task is the plan; every start creates a new run with
            its own history.
          </p>
        </div>
        {canCreateTask && (
          <button className="btn btn-primary" onClick={onNewTask}>
            New task
          </button>
        )}
      </div>
      {!tasks.length ? (
        <EmptyState
          title="No tasks yet"
          actions={
            canCreateTask && (
              <button className="btn btn-primary" onClick={onNewTask}>
                New task
              </button>
            )
          }
        >
          Create a task for a change you want reviewed and tested.
        </EmptyState>
      ) : (
        <div className="list">
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              project={byId.get(t.projectId)}
              latest={latest.get(t.id)}
              showProject={showProject}
              busy={busy}
              onStart={() => onStart(t)}
              onOpenRun={onOpenRun}
            />
          ))}
        </div>
      )}
    </>
  );
}

// "Needs you" ignores attempts that a newer run of the same task replaced.
const FILTERS = [
  { key: "all", label: "All", match: (r: Run) => !r.archived },
  {
    key: "you",
    label: "Needs you",
    match: (r: Run, latest: Set<string>) =>
      !r.archived && latest.has(r.id) && NEEDS_YOU.includes(r.state),
  },
  {
    key: "active",
    label: "In progress",
    match: (r: Run) => ACTIVE.includes(r.state),
  },
  {
    key: "verified",
    label: "Verified",
    match: (r: Run) => r.state === "verified",
  },
  { key: "archived", label: "Archived", match: (r: Run) => r.archived },
] as const;

export function RunsView({
  scopeLabel,
  showProject,
  projects,
  runs,
  onOpenRun,
}: {
  scopeLabel: string;
  showProject: boolean;
  projects: Project[];
  runs: Run[];
  onOpenRun: (id: string) => void;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const byId = new Map(projects.map((p) => [p.id, p]));
  const latest = new Set(
    [...latestRuns(runs.filter((r) => !r.archived)).values()].map((r) => r.id),
  );
  const matches = (key: string) => (r: Run) =>
    FILTERS.find((f) => f.key === key)!.match(r, latest);
  const shown = runs.filter(matches(filter));
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Runs</h1>
          <p className="page-sub">
            {scopeLabel}. Each run keeps the exact versions, settings and
            evidence it used.
          </p>
        </div>
      </div>
      <div className="filters" role="group" aria-label="Filter runs">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className="filter"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            <span className="faint"> {runs.filter(matches(f.key)).length}</span>
          </button>
        ))}
      </div>
      {!shown.length ? (
        <p className="empty-inline">
          {runs.length
            ? "No runs match this filter."
            : "No runs yet. Start one from a task."}
        </p>
      ) : (
        <div className="list">
          {shown.map((r) => (
            <RunRow
              key={r.id}
              run={r}
              project={byId.get(r.projectId)}
              showProject={showProject}
              onOpen={() => onOpenRun(r.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}
