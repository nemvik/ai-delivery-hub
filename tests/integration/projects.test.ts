import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, relative } from "node:path";
import { Store } from "../../packages/db/src/index";
import { generateDemo } from "../../packages/test-fixtures/src/generate";
import {
  createProject,
  createTask,
  startRun,
  updateProject,
  archiveProject,
} from "../../packages/core/src/service";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { inspectRepository } from "../../packages/adapters/src/inspect";
import type { Project, Run, Task } from "../../packages/contracts/src/index";
const stores: Store[] = [];
afterEach(() => stores.splice(0).forEach((s) => s.close()));
function setup() {
  const store = new Store(mkdtempSync(join(tmpdir(), "hub-projects-")));
  stores.push(store);
  return { store, project: generateDemo(store) };
}
function editable(project: Project) {
  const {
    id: _id,
    createdAt: _createdAt,
    archived: _archived,
    ...rest
  } = project;
  void _id;
  void _createdAt;
  void _archived;
  return rest;
}

describe("project editing", () => {
  it("keeps identity and does not rewrite a queued run's configuration", () => {
    const { store, project } = setup();
    const task = store.list<Task>("change_sets")[0]!;
    const run = startRun(store, task.id, "projects-edit-123");
    const updated = updateProject(store, project.id, {
      ...editable(project),
      name: "Renamed product",
    });
    expect(updated.id).toBe(project.id);
    expect(updated.createdAt).toBe(project.createdAt);
    expect(store.get<Project>("projects", project.id)!.name).toBe(
      "Renamed product",
    );
    expect(store.get<Run>("runs", run.id)!.config.project.name).toBe(
      project.name,
    );
  });
  it("rejects invalid edits with the same rules as registration", () => {
    const { store, project } = setup();
    const base = editable(project);
    expect(() => updateProject(store, "missing", base)).toThrow(
      "Project not found",
    );
    expect(() =>
      updateProject(store, project.id, {
        ...base,
        repositories: [...base.repositories, base.repositories[0]!],
      }),
    ).toThrow("Duplicate repository keys");
    expect(() =>
      updateProject(store, project.id, {
        ...base,
        surfaces: [{ key: "x", repoKey: "nope", kind: "web", cwd: "." }],
      }),
    ).toThrow("Unknown repository");
    expect(() =>
      updateProject(store, project.id, {
        ...base,
        repositories: [
          { ...base.repositories[0]!, sourcePath: "/definitely/missing/repo" },
        ],
      }),
    ).toThrow();
    expect(store.get<Project>("projects", project.id)!.name).toBe(project.name);
  });
  it("archives without deleting history and blocks new tasks", () => {
    const { store, project } = setup();
    const task = store.list<Task>("change_sets")[0]!;
    startRun(store, task.id, "projects-archive-123");
    expect(archiveProject(store, project.id, true).archived).toBe(true);
    expect(store.list("runs")).toHaveLength(1);
    expect(() =>
      createTask(store, { projectId: project.id, title: "x", criteria: "y" }),
    ).toThrow("archived");
    expect(archiveProject(store, project.id, false).archived).toBe(false);
    expect(
      createTask(store, { projectId: project.id, title: "x", criteria: "y" })
        .projectId,
    ).toBe(project.id);
  });
});

describe("repository inspection", () => {
  it("lists the branches of an explicit repository root", () => {
    const { store, project } = setup();
    const repo = project.repositories[0]!;
    const result = inspectRepository(store.root, repo.sourcePath + "/");
    expect(result.path).toBe(repo.sourcePath);
    expect(result.currentBranch).toBe("main");
    expect(result.branches).toContain("main");
    expect(result.suggestedKey).toBe("fixture-monorepo");
  });
  it("expands ~ to the home directory", () => {
    const { store, project } = setup();
    const repo = project.repositories[0]!;
    const previous = process.env.HOME;
    process.env.HOME = store.root;
    try {
      const rel = relative(homedir(), repo.sourcePath);
      expect(rel.startsWith("..")).toBe(false);
      expect(inspectRepository(store.root, "~/" + rel).path).toBe(
        repo.sourcePath,
      );
    } finally {
      process.env.HOME = previous;
    }
  });
  it("refuses non-repositories, subfolders, files, missing paths and hub internals", () => {
    const { store, project } = setup();
    const repo = project.repositories[0]!.sourcePath;
    const plain = join(store.root, "fixtures", "plain");
    mkdirSync(plain, { recursive: true });
    const nested = join(repo, "nested");
    mkdirSync(nested, { recursive: true });
    const internal = join(store.root, "repos", "x");
    mkdirSync(internal, { recursive: true });
    expect(() => inspectRepository(store.root, "relative/path")).toThrow(
      "absolute",
    );
    expect(() => inspectRepository(store.root, "/definitely/missing")).toThrow(
      "does not exist",
    );
    expect(() =>
      inspectRepository(store.root, join(repo, "README.md")),
    ).toThrow("not a folder");
    expect(() => inspectRepository(store.root, plain)).toThrow(
      "not a Git repository",
    );
    expect(() => inspectRepository(store.root, nested)).toThrow(
      "repository root",
    );
    expect(() => inspectRepository(store.root, internal)).toThrow(
      "hub's own data",
    );
    expect(realpathSync(store.root)).toBe(store.root);
  });
});

describe("review findings on project editing", () => {
  function realProject(store: Store, sourcePath: string) {
    return createProject(store, {
      name: "Real product",
      trusted: true,
      repositories: [{ key: "app", sourcePath, baselineRef: "main" }],
    });
  }
  const reviewer = {
    provider: "claude-code-cli",
    model: "claude-opus-5-5",
    effort: null,
    timeoutSeconds: 600,
    maxTurns: null,
  };
  it("creates a Review + QA task for a real project without an implementer", () => {
    const { store, project } = setup();
    const real = realProject(store, project.repositories[0]!.sourcePath);
    const task = createTask(store, {
      projectId: real.id,
      title: "Review",
      criteria: "Works",
      mode: "review_qa",
      reviewer,
    });
    expect(task.reviewer.provider).toBe("claude-code-cli");
    expect(() =>
      createTask(store, {
        projectId: real.id,
        title: "Implement",
        criteria: "Works",
        mode: "implement_review_qa",
        reviewer,
      }),
    ).toThrow("DEMO");
  });
  it("does not silently re-bind a replaced source directory on save", () => {
    const { store, project } = setup();
    const real = realProject(store, project.repositories[0]!.sourcePath);
    store.put("projects", {
      ...real,
      repositories: real.repositories.map((r) => ({
        ...r,
        sourceIdentity: "0:0",
      })),
    });
    const stored = store.get<Project>("projects", real.id)!;
    expect(() =>
      updateProject(store, real.id, { ...editable(stored), name: "Renamed" }),
    ).toThrow("changed since it was registered");
    const rebound = updateProject(store, real.id, {
      ...editable(stored),
      repositories: stored.repositories.map(
        ({ sourceIdentity: _identity, ...r }) => {
          void _identity;
          return r;
        },
      ),
    });
    expect(rebound.repositories[0]!.sourceIdentity).not.toBe("0:0");
  });
  it("refuses to start a task whose repository was renamed or removed", () => {
    const { store, project } = setup();
    const real = realProject(store, project.repositories[0]!.sourcePath);
    const task = createTask(store, {
      projectId: real.id,
      title: "Review",
      criteria: "Works",
      mode: "qa_only",
      refs: { app: "main" },
    });
    updateProject(store, real.id, {
      ...editable(real),
      repositories: real.repositories.map((r) => ({ ...r, key: "web" })),
    });
    expect(() => startRun(store, task.id, "renamed-repo-123")).toThrow(
      "no longer in the project",
    );
  });
  it("refuses to start runs in an archived project", () => {
    const { store, project } = setup();
    const task = store.list<Task>("change_sets")[0]!;
    archiveProject(store, project.id, true);
    expect(() => startRun(store, task.id, "archived-start-123")).toThrow(
      "archived",
    );
  });
  it("rejects repositories inside the hub's own data folders", () => {
    const { store } = setup();
    const inside = join(store.root, "runs", "x", "worktrees", "app");
    mkdirSync(inside, { recursive: true });
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: inside });
    expect(() => realProject(store, inside)).toThrow("hub's own data");
  });
  it("inspection never runs repository-defined filters", () => {
    const { store, project } = setup();
    const repo = project.repositories[0]!.sourcePath;
    const marker = join(store.root, "filter-ran");
    execFileSync("git", [
      "-C",
      repo,
      "config",
      "filter.probe.clean",
      `sh -c 'touch "${marker}"; cat'`,
    ]);
    writeFileSync(join(repo, ".gitattributes"), "* filter=probe\n");
    writeFileSync(join(repo, "README.md"), "changed locally\n");
    inspectRepository(store.root, repo);
    expect(existsSync(marker)).toBe(false);
  });
});
