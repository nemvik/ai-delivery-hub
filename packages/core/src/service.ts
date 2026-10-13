import { z } from "zod";
import { Store } from "../../db/src/index";
import {
  projectSchema,
  taskSchema,
  type Project,
  type Task,
  type Run,
  type Snapshot,
} from "../../contracts/src/index";
import { id, now, digest, hash } from "./paths";
import { pinProject, git, sourceIdentity } from "../../adapters/src/git";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { freezeReviewGuidance } from "./review-skills";
import { assertOutsideHubData } from "../../adapters/src/inspect";
function validateProject(store: Store, input: unknown) {
  const parsed = projectSchema.parse(input);
  if (
    new Set(parsed.repositories.map((r) => r.key)).size !==
    parsed.repositories.length
  )
    throw new Error("Duplicate repository keys");
  const project = {
    ...parsed,
    repositories: parsed.repositories.map((r) => {
      const sourcePath = realpathSync(r.sourcePath);
      assertOutsideHubData(store.root, sourcePath);
      const identity = sourceIdentity(sourcePath);
      // A stored identity is kept only while the folder is the same one;
      // re-binding requires checking the folder again (identity omitted).
      if (r.sourceIdentity && r.sourceIdentity !== identity)
        throw new Error(
          `The folder for “${r.key}” changed since it was registered. Check the folder again in Repositories to register it anew.`,
        );
      return { ...r, sourcePath, sourceIdentity: identity };
    }),
  };
  for (const item of [...project.surfaces, ...project.commands])
    if (!project.repositories.some((r) => r.key === item.repoKey))
      throw new Error("Unknown repository");
  for (const [name, items] of [
    ["surface", project.surfaces.map((s) => s.key)],
    ["command", project.commands.map((c) => c.id)],
    ["scenario", project.scenarios.map((s) => s.id)],
  ] as const)
    if (new Set(items).size !== items.length)
      throw new Error("Duplicate " + name + " keys");
  for (const scenario of project.scenarios) {
    if (
      scenario.surfaceKeys.some(
        (k) => !project.surfaces.some((s) => s.key === k),
      )
    )
      throw new Error("Unknown scenario surface");
    if (
      scenario.commandId &&
      !project.commands.some(
        (c) => c.id === scenario.commandId && c.kind === "suite",
      )
    )
      throw new Error("Scenario requires an approved suite command");
  }
  for (const service of project.runtime?.services || [])
    if (
      !project.commands.some(
        (c) => c.id === service.commandId && c.kind === "start",
      )
    )
      throw new Error("Service requires an approved start command");
  freezeReviewGuidance({ ...project, id: "", createdAt: "" });
  return project;
}
export function createProject(store: Store, input: unknown) {
  return store.put("projects", {
    ...validateProject(store, input),
    id: id(),
    createdAt: now(),
  });
}
export function updateProject(store: Store, projectId: string, input: unknown) {
  const existing = store.get<Project>("projects", projectId);
  if (!existing) throw new Error("Project not found");
  const validated = validateProject(store, input);
  const project = store.put<Project>("projects", {
    ...validated,
    id: existing.id,
    createdAt: existing.createdAt,
    archived: existing.archived,
  });
  store.event(
    null,
    "project",
    `Project settings updated: ${project.name}; configuration ${digest(validated).slice(0, 12)}`,
  );
  return project;
}
export function archiveProject(
  store: Store,
  projectId: string,
  archived: boolean,
) {
  const existing = store.get<Project>("projects", projectId);
  if (!existing) throw new Error("Project not found");
  const project = store.put<Project>("projects", { ...existing, archived });
  store.event(
    null,
    "project",
    `Project ${archived ? "archived" : "restored"}: ${project.name}`,
  );
  return project;
}
export function createTask(store: Store, input: unknown) {
  const projectId = z.object({ projectId: z.string() }).parse(input).projectId;
  const selected = store.get<Project>("projects", projectId);
  const task = taskSchema.parse({
    ...store.settings().defaultRoles,
    ...selected?.defaultRoles,
    ...(input as object),
  });
  const project = store.get<Project>("projects", task.projectId);
  if (!project) throw new Error("Project not found");
  if (project.archived)
    throw new Error("Project is archived; restore it before creating tasks");
  // Only roles the mode actually runs need a real provider.
  const used =
    task.mode === "qa_only"
      ? []
      : task.mode === "review_qa"
        ? [task.reviewer]
        : [task.implementer, task.reviewer];
  if (!project.demo && used.some((r) => r.provider === "fake"))
    throw new Error("Fake provider is available only in a DEMO project");
  for (const key of Object.keys(task.refs))
    if (!project.repositories.some((r) => r.key === key))
      throw new Error("Unknown repository ref");
  return store.put("change_sets", { ...task, id: id(), createdAt: now() });
}
export function startRun(
  store: Store,
  taskId: string,
  idempotency: string,
): Run {
  if (!/^[a-zA-Z0-9_-]{8,150}$/.test(idempotency))
    throw new Error("Idempotency-Key required");
  return store.sql
    .transaction(() => {
      const existing = store.sql
        .prepare("SELECT run_id FROM commands WHERE idempotency_key=?")
        .get("start:" + taskId + ":" + idempotency) as
        { run_id: string } | undefined;
      if (existing) return store.get<Run>("runs", existing.run_id)!;
      const task = store.get<Task>("change_sets", taskId);
      if (!task) throw new Error("Task not found");
      const project = store.get<Project>("projects", task.projectId);
      if (!project) throw new Error("Project not found");
      if (project.archived)
        throw new Error("Project is archived; restore it before starting runs");
      for (const key of Object.keys(task.refs))
        if (!project.repositories.some((r) => r.key === key))
          throw new Error(
            `This task selects a branch for “${key}”, which is no longer in the project. Create a new task.`,
          );
      const prior = task.sourceSnapshotId
        ? store.get<Snapshot>("snapshots", task.sourceSnapshotId)
        : undefined;
      if (
        task.sourceSnapshotId &&
        (!prior ||
          store.get<Run>("runs", prior.runId)?.projectId !== project.id ||
          ["running", "queued"].includes(
            store.get<Run>("runs", prior.runId)!.state,
          ))
      )
        throw new Error("Invalid continuation snapshot");
      const pins = prior
        ? prior.repositories.map((r) => ({
            repoKey: r.repoKey,
            headSha: r.headSha,
            baselineSha: r.baselineSha,
            sourceDirty: r.sourceDirty,
          }))
        : pinProject(project, task.refs);
      for (const pin of task.dependencyPins)
        if (pins.find((p) => p.repoKey === pin.repoKey)?.headSha !== pin.sha)
          throw new Error(
            "Dependency pin conflicts with selected repository revision",
          );
      const run: Run = {
        id: id(),
        taskId,
        projectId: project.id,
        state: "queued",
        createdAt: now(),
        updatedAt: now(),
        config: {
          task,
          project,
          pins,
          reviewGuidance:
            task.mode === "qa_only" ? undefined : freezeReviewGuidance(project),
          lockedTests: Object.fromEntries(
            project.requiredTestPaths.map((t) => {
              const r = project.repositories.find((r) => r.key === t.repoKey);
              if (!r) throw new Error("Unknown required test repo");
              return [
                t.repoKey + "/" + t.path,
                hash(
                  git(
                    prior
                      ? join(
                          store.root,
                          "repos",
                          prior.repositories.find(
                            (p) => p.repoKey === t.repoKey,
                          )!.repositoryId + ".git",
                        )
                      : r.sourcePath,
                    [
                      "show",
                      pins.find((p) => p.repoKey === t.repoKey)!.headSha +
                        ":" +
                        t.path,
                    ],
                  ),
                ),
              ];
            }),
          ),
        },
        snapshotId: null,
        stale: false,
        queueReason: "Waiting for worker",
        error: null,
        publication: "local_only",
        archived: false,
        pinned: false,
      };
      store.put("runs", run);
      store.enqueue("start", run.id, {}, "start:" + taskId + ":" + idempotency);
      store.event(
        run.id,
        "queued",
        `Queued ${task.mode}; configuration ${digest(run.config).slice(0, 12)}`,
      );
      return run;
    })
    .immediate();
}
const actionSchema = z
  .object({
    action: z.enum([
      "cancel",
      "pause",
      "retry",
      "publish",
      "approve",
      "refresh-baseline",
      "archive",
      "cleanup-evidence",
    ]),
    snapshotId: z.string().optional(),
    author: z.string().min(1).max(100).optional(),
    reason: z.string().min(3).max(3000).optional(),
    destinationId: z.string().optional(),
    manualScenarioIds: z.array(z.string()).default([]),
  })
  .strict();
export function action(store: Store, runId: string, input: unknown) {
  const data = actionSchema.parse(input);
  const run = store.get<Run>("runs", runId);
  if (!run) throw new Error("Run not found");
  if (
    data.action === "approve" &&
    (!data.author || !data.reason || data.snapshotId !== run.snapshotId)
  )
    throw new Error("Approval requires current snapshot, author and reason");
  return store.enqueue(
    data.action,
    runId,
    data,
    `${data.action}:${runId}:${digest(data)}${["publish", "refresh-baseline"].includes(data.action) ? ":" + id() : ""}`,
  );
}
