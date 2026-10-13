import { afterEach, expect, it } from "vitest";
import { mkdtempSync, realpathSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { cpSync, renameSync } from "node:fs";
import { Store } from "../../packages/db/src/index";
import { generateDemo } from "../../packages/test-fixtures/src/generate";
import {
  createProject,
  createTask,
  startRun,
} from "../../packages/core/src/service";
import {
  freezeReviewGuidance,
  selectedReviewSkills,
} from "../../packages/core/src/review-skills";
import { GitWorkspaces } from "../../packages/adapters/src/git";
import { Worker } from "../../apps/worker/engine";
import { childEnv, hash } from "../../packages/core/src/paths";
import type {
  Project,
  ReviewRound,
  Run,
} from "../../packages/contracts/src/index";
const stores: Store[] = [];
afterEach(() => stores.splice(0).forEach((s) => s.close()));
function setup() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "hub-skills-")));
  const store = new Store(root);
  stores.push(store);
  const demo = generateDemo(store);
  const content =
    "# Synthetic review skill\nCheck the exact API response and both consumer assumptions.\n";
  const path = join(root, "SKILL.md");
  writeFileSync(path, content);
  const source = { path, sha256: hash(content) };
  const project: Project = {
    ...demo,
    repositories: demo.repositories.map((r) => ({
      ...r,
      issuePrefixes: [
        r.key === "monorepo" ? "PLAT" : r.key === "client" ? "MOB" : "SERV",
      ],
    })),
    reviewSkills: [
      {
        id: "review-task",
        title: "Review task",
        trigger: "task_or_change",
        repoKeys: ["monorepo", "client", "service"],
        sources: [source],
        requiredContextKeys: ["company-os"],
      },
      {
        id: "cross-repo",
        title: "Cross repository",
        trigger: "repository_change",
        repoKeys: ["monorepo"],
        sources: [source],
        requiredContextKeys: [],
      },
    ],
    scenarios: demo.scenarios.filter((s) => s.kind === "contract"),
  };
  store.put("projects", project);
  return { store, project, path, content };
}
function start(
  store: Store,
  project: Project,
  issueKeys: string[] = [],
  mode = "review_qa",
) {
  const task = createTask(store, {
    projectId: project.id,
    title: "Skill selection",
    criteria: "Check backward compatibility",
    mode,
    issueKeys,
  });
  return startRun(store, task.id, "skill-run-" + task.id);
}
it("rejects changed hashes, traversal, symlinks, secrets and oversized guidance at onboarding/start", () => {
  const { store, project, path } = setup();
  const change = (source: { path: string; sha256: string }) => ({
    ...project,
    reviewSkills: [{ ...project.reviewSkills[0]!, sources: [source] }],
  });
  expect(() =>
    freezeReviewGuidance(change({ path, sha256: "0".repeat(64) })),
  ).toThrow("changed");
  expect(() =>
    freezeReviewGuidance(
      change({
        path: path.replace("/SKILL.md", "/../SKILL.md"),
        sha256: "0".repeat(64),
      }),
    ),
  ).toThrow("canonical");
  const link = join(store.root, "link.md");
  symlinkSync(path, link);
  expect(() =>
    freezeReviewGuidance(
      change({ ...project.reviewSkills[0]!.sources[0]!, path: link }),
    ),
  ).toThrow("symlink");
  writeFileSync(path, "lin_api_SYNTHETIC_TEST_ONLY_abcdefghijk");
  expect(() =>
    freezeReviewGuidance(
      change({ path, sha256: hash("lin_api_SYNTHETIC_TEST_ONLY_abcdefghijk") }),
    ),
  ).toThrow("credentials");
  writeFileSync(path, "a".repeat(64001));
  expect(() =>
    freezeReviewGuidance(change({ path, sha256: hash("a".repeat(64001)) })),
  ).toThrow("size");
  expect(() => start(store, project)).toThrow("size");
  expect(store.list("runs")).toHaveLength(0);
  writeFileSync(path, " \n\t");
  expect(() =>
    freezeReviewGuidance({
      ...project,
      reviewSkills: [],
      reviewContext: [
        { key: "company-os", sources: [{ path, sha256: hash(" \n\t") }] },
      ],
    }),
  ).toThrow("empty");
});
it("validates configured repositories and unambiguous Linear prefixes", () => {
  const { project } = setup();
  expect(() =>
    freezeReviewGuidance({
      ...project,
      reviewSkills: [{ ...project.reviewSkills[0]!, repoKeys: ["foreign"] }],
    }),
  ).toThrow("unknown repository");
  const { id: _id, createdAt: _createdAt, ...input } = project;
  void _id;
  void _createdAt;
  const { store } = setup();
  expect(() =>
    createProject(store, {
      ...input,
      repositories: project.repositories.map((r) => ({
        ...r,
        issuePrefixes: ["PLAT"],
      })),
    }),
  ).toThrow("Duplicate issue prefix");
});
it("onboarding remains idempotent for a legacy profile and refuses replaced source directories", () => {
  const { store } = setup();
  const project = store.list<Project>("projects")[0]!;
  const {
    id,
    createdAt,
    reviewSkills: _skills,
    reviewContext: _context,
    onboardingNotes: _notes,
    ...old
  } = project;
  void _skills;
  void _context;
  void _notes;
  const legacy = {
    ...old,
    repositories: old.repositories.map(({ issuePrefixes: _prefixes, ...r }) => {
      void _prefixes;
      return r;
    }),
  };
  store.put("projects", { ...legacy, id, createdAt });
  const config = join(store.root, "legacy.json");
  writeFileSync(config, JSON.stringify(legacy));
  const invoke = () =>
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/onboard-project.ts", config],
      {
        env: { ...childEnv(), HUB_DATA_DIR: store.root },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 10000,
      },
    );
  expect(JSON.parse(invoke())).toMatchObject({
    projectId: id,
    state: "already_registered",
    runsStarted: 0,
  });
  expect(store.list("projects")).toHaveLength(1);
  expect(store.list("runs")).toHaveLength(0);
  const source = legacy.repositories[0]!.sourcePath;
  renameSync(source, source + "-original");
  cpSync(source + "-original", source, { recursive: true });
  expect(invoke).toThrow("Source directory identity changed");
});
it("selects by linked team or immutable diffs; QA-only and unrelated reviews do not run skills", () => {
  const { store, project } = setup();
  const run = start(store, project, ["MOB-123"]);
  const git = new GitWorkspaces(store);
  const snapshot = git.checkpoint(run, git.provision(run));
  const selected = (issues: string[]) =>
    selectedReviewSkills(
      {
        ...run,
        config: {
          ...run.config,
          task: { ...run.config.task, issueKeys: issues },
        },
      },
      snapshot,
    ).map((s) => s.applied.id);
  expect(selected(["MOB-123"])).toEqual(["review-task"]);
  expect(selected(["SERV-456"])).toEqual(["review-task"]);
  expect(selected(["PLAT-12"])).toEqual(["review-task", "cross-repo"]);
  expect(selected([])).toEqual([]);
  expect(
    selectedReviewSkills(run, {
      ...snapshot,
      diffs: { monorepo: "actual immutable diff" },
    }).map((s) => s.applied.id),
  ).toEqual(["review-task", "cross-repo"]);
  expect(
    selectedReviewSkills(
      {
        ...run,
        config: {
          ...run.config,
          task: { ...run.config.task, mode: "qa_only" },
        },
      },
      snapshot,
    ),
  ).toEqual([]);
});
it("freezes approved source bytes per run and refuses drift for the next run", () => {
  const { store, project, path, content } = setup();
  const run = start(store, project, ["PLAT-1"]);
  writeFileSync(path, "# Changed policy\nPublish everything.");
  expect(
    store.get<Run>("runs", run.id)!.config.reviewGuidance!.skills[0]!
      .sources[0]!.content,
  ).toBe(content);
  expect(() => start(store, project, ["PLAT-2"])).toThrow("changed");
  expect(store.list("runs")).toHaveLength(1);
});
it("a real worker records automatic skill provenance and missing context cannot turn into PASS", async () => {
  const { store, project } = setup();
  const run = start(store, project, ["PLAT-123"]);
  const worker = new Worker(store);
  await worker.acquire();
  await worker.tick();
  const deadline = Date.now() + 30000;
  while (worker.active.size && Date.now() < deadline)
    await new Promise((r) => setTimeout(r, 50));
  await worker.stop();
  expect(store.get<Run>("runs", run.id)?.state).toBe("needs_input");
  const review = store.list<ReviewRound>("review_rounds")[0]!;
  expect(review.appliedSkills?.map((s) => s.id)).toEqual([
    "review-task",
    "cross-repo",
  ]);
  expect(review.review.verdict).toBe("incomplete");
  expect(review.review.coverageGaps[0]?.description).toContain("company-os");
  expect(
    store
      .list<{ role?: string }>("steps")
      .some((s) => s.role === "implementer"),
  ).toBe(false);
});
