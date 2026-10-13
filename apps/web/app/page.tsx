"use client";
import { useEffect, useState } from "react";
import type { Task } from "../../../packages/contracts/src/index";
import { useHub } from "../lib/hub";
import {
  rememberProject,
  rememberedProject,
  resolveNav,
  serializeNav,
  useNav,
} from "../lib/nav";
import { Shell } from "../components/shell";
import { Overview, needsYou } from "../components/overview";
import { RunsView, TasksView } from "../components/lists";
import { RunDetailView } from "../components/run/run-detail";
import { ProjectSettings } from "../components/project/project-settings";
import { NewProject } from "../components/project/new-project";
import { AppSettings } from "../components/app-settings";
import { TaskForm } from "../components/task-form";
import { Banner, EmptyState } from "../components/ui";

export default function Home() {
  const [rawNav, setNav] = useNav();
  const hub = useHub(rawNav.run);
  const { state, detail } = hub;
  const [taskForm, setTaskForm] = useState<{ seed?: Partial<Task> } | null>(
    null,
  );
  const [projectIntro, setProjectIntro] = useState<string | null>(null);
  const [remembered, setRemembered] = useState<string | null>(null);
  useEffect(() => setRemembered(rememberedProject()), []);

  const nav = state.loaded
    ? resolveNav(rawNav, state.projects, state.runs, remembered)
    : rawNav;
  useEffect(() => {
    if (!state.loaded) return;
    if (nav.project && nav.project !== "all") rememberProject(nav.project);
    // Keep the address bar in sync when a stale link was corrected.
    const url = window.location.pathname + serializeNav(nav);
    if (url !== window.location.pathname + window.location.search)
      window.history.replaceState(null, "", url);
  }, [state.loaded, nav]);

  const project = state.projects.find((p) => p.id === nav.project);
  const all = nav.project === "all";
  const inScope = (projectId: string) => all || projectId === nav.project;
  const tasks = state.tasks.filter((t) => inScope(t.projectId));
  const runs = state.runs.filter((r) => inScope(r.projectId));
  const activeProjects = state.projects.filter((p) => !p.archived);
  const scopeLabel = all ? "All projects" : (project?.name ?? "");
  const canCreateTask = all
    ? activeProjects.length > 0
    : !!project && !project.archived;
  const openRun = (id: string) =>
    setNav({ run: id, view: "runs", tab: "Overview" });
  const start = async (task: Task) => {
    const run = await hub.startTask(task);
    if (run) openRun(run.id);
  };
  const newTask = () => setTaskForm({});

  let content: React.ReactNode;
  if (!state.loaded) content = <p className="empty-inline">Loading…</p>;
  else if (nav.run && detail && detail.run.id === nav.run)
    content = (
      <RunDetailView
        key={detail.run.id}
        detail={detail}
        project={state.projects.find((p) => p.id === detail.run.projectId)}
        hub={hub}
        destinations={state.destinations}
        tab={nav.tab}
        setTab={(tab) => setNav({ tab }, { replace: true })}
        onBack={() => setNav({ run: null, view: "runs", tab: "Overview" })}
        onPrepareFix={(seed) => setTaskForm({ seed })}
        onOpenSettings={() =>
          setNav({ run: null, view: "settings", section: "reports" })
        }
        onOpenRun={openRun}
      />
    );
  else if (nav.run) content = <p className="empty-inline">Loading run…</p>;
  else if (nav.view === "new-project")
    content = (
      <NewProject
        hub={hub}
        settings={state.settings}
        home={state.home}
        onCancel={() => setNav({ view: "overview" })}
        onCreated={(p) => {
          setProjectIntro(
            `“${p.name}” is ready. Next, add test commands and at least one required scenario. Until then runs can review code but can’t pass QA.`,
          );
          setNav({ project: p.id, view: "project", section: "tests" });
        }}
      />
    );
  else if (nav.view === "settings")
    content = (
      <AppSettings
        state={state}
        hub={hub}
        section={nav.section}
        setSection={(section) => setNav({ section }, { replace: true })}
        onOpenProject={(id) =>
          setNav({ project: id, view: "project", section: "general" })
        }
      />
    );
  else if (nav.view === "project")
    content = project ? (
      <ProjectSettings
        key={project.id}
        project={project}
        hub={hub}
        settings={state.settings}
        home={state.home}
        section={nav.section}
        setSection={(section) => {
          setProjectIntro(null);
          setNav({ section }, { replace: true });
        }}
        onArchived={() => setNav({ project: null, view: "overview" })}
        intro={projectIntro ?? undefined}
      />
    ) : (
      <EmptyState
        title="Pick a project"
        actions={
          <button className="btn" onClick={() => setNav({ view: "overview" })}>
            Back to overview
          </button>
        }
      >
        Project settings belong to one project. Choose it in the project
        switcher.
      </EmptyState>
    );
  else if (nav.view === "tasks")
    content = (
      <TasksView
        scopeLabel={scopeLabel}
        showProject={all}
        projects={state.projects}
        tasks={tasks}
        runs={runs}
        busy={hub.busy}
        canCreateTask={canCreateTask}
        onStart={(t) => void start(t)}
        onOpenRun={openRun}
        onNewTask={newTask}
      />
    );
  else if (nav.view === "runs")
    content = (
      <RunsView
        scopeLabel={scopeLabel}
        showProject={all}
        projects={state.projects}
        runs={runs}
        onOpenRun={openRun}
      />
    );
  else
    content = (
      <Overview
        scopeLabel={
          scopeLabel
            ? `${scopeLabel} · what needs attention`
            : "What needs attention"
        }
        showProject={all}
        projects={all ? activeProjects : project ? [project] : []}
        tasks={tasks}
        runs={runs}
        busy={hub.busy}
        canCreateTask={canCreateTask}
        onOpenRun={openRun}
        onStart={(t) => void start(t)}
        onNewTask={newTask}
        onNewProject={() => setNav({ view: "new-project" })}
        onDemo={async () => {
          const ok = await hub.mutate("demo", {});
          if (ok)
            hub.setNotice(
              "Creating the demo project. It appears in a few seconds.",
            );
        }}
        onShowRuns={() => setNav({ view: "runs" })}
      />
    );

  return (
    <Shell
      state={state}
      nav={nav}
      setNav={setNav}
      counts={{
        needsYou: needsYou(runs).length,
        tasks: tasks.length,
        runs: runs.filter((r) => !r.archived).length,
      }}
    >
      {hub.error && (
        <Banner tone="bad" role="alert" onClose={() => hub.setError("")}>
          {hub.error}
        </Banner>
      )}
      {hub.notice && (
        <Banner tone="ok" role="status" onClose={() => hub.setNotice("")}>
          {hub.notice}
        </Banner>
      )}
      {content}
      {taskForm && (
        <TaskForm
          projects={activeProjects}
          projectId={all ? null : (project?.id ?? null)}
          state={state}
          hub={hub}
          seed={taskForm.seed}
          onClose={() => setTaskForm(null)}
          onDone={({ task, run, startError }) => {
            setTaskForm(null);
            if (run) openRun(run.id);
            else {
              if (startError)
                hub.setError(
                  `“${task.title}” was saved, but the run didn’t start: ${startError}`,
                );
              else
                hub.setNotice(
                  `“${task.title}” saved. Start it when you’re ready.`,
                );
              setNav({ view: "tasks", run: null });
            }
          }}
        />
      )}
    </Shell>
  );
}
