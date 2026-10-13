"use client";
import type { Project, Run, Task } from "../../../packages/contracts/src/index";
import { ACTIVE, NEEDS_YOU } from "../lib/labels";
import { EmptyState } from "./ui";
import { RunRow, TaskRow, latestRuns } from "./rows";

export function needsYou(runs: Run[]) {
  return [...latestRuns(runs.filter((r) => !r.archived)).values()]
    .filter((r) => NEEDS_YOU.includes(r.state))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function Overview({
  scopeLabel,
  showProject,
  projects,
  tasks,
  runs,
  busy,
  canCreateTask,
  onOpenRun,
  onStart,
  onNewTask,
  onNewProject,
  onDemo,
  onShowRuns,
}: {
  scopeLabel: string;
  showProject: boolean;
  projects: Project[];
  tasks: Task[];
  runs: Run[];
  busy: boolean;
  canCreateTask: boolean;
  onOpenRun: (id: string) => void;
  onStart: (task: Task) => void;
  onNewTask: () => void;
  onNewProject: () => void;
  onDemo: () => void;
  onShowRuns: () => void;
}) {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const attention = needsYou(runs);
  const active = runs
    .filter((r) => ACTIVE.includes(r.state))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const started = new Set(runs.map((r) => r.taskId));
  const ready = tasks.filter(
    (t) => !started.has(t.id) && !byId.get(t.projectId)?.archived,
  );
  const head = (
    <div className="page-head">
      <div>
        <h1 className="page-title">Overview</h1>
        <p className="page-sub">{scopeLabel}</p>
      </div>
      {canCreateTask && (
        <button className="btn btn-primary" onClick={onNewTask}>
          New task
        </button>
      )}
    </div>
  );
  if (!projects.length)
    return (
      <>
        {head}
        <EmptyState
          title="Set up your first project"
          actions={
            <>
              <button className="btn btn-primary" onClick={onNewProject}>
                New project
              </button>
              <button className="btn" disabled={busy} onClick={onDemo}>
                Try the demo project
              </button>
            </>
          }
        >
          A project lists the repositories the hub may read, the tests it may
          run and the AI models it uses. The demo creates three small local
          repositories with synthetic data.
        </EmptyState>
      </>
    );
  if (!tasks.length)
    return (
      <>
        {head}
        <EmptyState
          title="Create a task to check a change"
          actions={
            canCreateTask && (
              <button className="btn btn-primary" onClick={onNewTask}>
                New task
              </button>
            )
          }
        >
          A task says which branches to check and what must be true when the
          work is done. Nothing runs until you start it.
        </EmptyState>
      </>
    );
  const nothing = !attention.length && !active.length && !ready.length;
  return (
    <>
      {head}
      {nothing && (
        <EmptyState
          title="You're all caught up"
          actions={
            <button className="btn" onClick={onShowRuns}>
              See all runs
            </button>
          }
        >
          No run is waiting for you and nothing is running.
        </EmptyState>
      )}
      {attention.length > 0 && (
        <section className="group" aria-labelledby="g-you">
          <div className="group-head">
            <h2 id="g-you">Needs you</h2>
            <span className="count">{attention.length}</span>
          </div>
          <div className="list">
            {attention.map((r) => (
              <RunRow
                key={r.id}
                run={r}
                project={byId.get(r.projectId)}
                showProject={showProject}
                onOpen={() => onOpenRun(r.id)}
              />
            ))}
          </div>
        </section>
      )}
      {active.length > 0 && (
        <section className="group" aria-labelledby="g-active">
          <div className="group-head">
            <h2 id="g-active">Running now</h2>
            <span className="count">{active.length}</span>
            <span className="hint">Live updates</span>
          </div>
          <div className="list">
            {active.map((r) => (
              <RunRow
                key={r.id}
                run={r}
                project={byId.get(r.projectId)}
                showProject={showProject}
                onOpen={() => onOpenRun(r.id)}
              />
            ))}
          </div>
        </section>
      )}
      {ready.length > 0 && (
        <section className="group" aria-labelledby="g-ready">
          <div className="group-head">
            <h2 id="g-ready">Ready to start</h2>
            <span className="count">{ready.length}</span>
          </div>
          <div className="list">
            {ready.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                project={byId.get(t.projectId)}
                showProject={showProject}
                busy={busy}
                onStart={() => onStart(t)}
                onOpenRun={onOpenRun}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
