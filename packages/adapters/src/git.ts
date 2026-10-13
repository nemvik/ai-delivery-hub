import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { join, dirname } from "node:path";
import type {
  Run,
  Snapshot,
  Workspace,
  Project,
} from "../../contracts/src/index";
import { Store } from "../../db/src/index";
import {
  childEnv,
  digest,
  id,
  now,
  fileMap,
  forbidden,
  safePath,
  inside,
  sensitiveContent,
} from "../../core/src/paths";
export function git(cwd: string, args: string[]) {
  return execFileSync(
    "git",
    [
      "--literal-pathspecs",
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.fsmonitor=false",
      "-c",
      "protocol.file.allow=always",
      ...args,
    ],
    {
      cwd,
      env: {
        ...childEnv(),
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_TERMINAL_PROMPT: "0",
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
      maxBuffer: 20 * 1024 * 1024,
    },
  ).trimEnd();
}
export function resolveRef(path: string, ref: string) {
  if (ref.startsWith("-") || ref.includes("\0") || ref.length > 200)
    throw new Error("Invalid Git ref");
  const sha = git(path, [
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${ref}^{commit}`,
  ]).trim();
  if (!/^[0-9a-f]{40,64}$/.test(sha)) throw new Error("Invalid revision");
  return sha;
}
export function sourceIdentity(path: string) {
  const canonical = realpathSync(path);
  if (canonical !== path)
    throw new Error("Source path changed or is not canonical");
  if (realpathSync(git(path, ["rev-parse", "--show-toplevel"])) !== path)
    throw new Error("Register the exact Git repository root");
  const stat = statSync(path);
  return String(stat.dev) + ":" + String(stat.ino);
}
export function pinProject(project: Project, refs: Record<string, string>) {
  return project.repositories.map((r) => {
    if (sourceIdentity(r.sourcePath) !== r.sourceIdentity)
      throw new Error("Source directory identity changed; repeat onboarding");
    return {
      repoKey: r.key,
      baselineSha: resolveRef(r.sourcePath, r.baselineRef),
      headSha: resolveRef(r.sourcePath, refs[r.key] || r.baselineRef),
      sourceDirty: git(r.sourcePath, ["status", "--porcelain"]).length > 0,
    };
  });
}
export class GitWorkspaces {
  constructor(readonly store: Store) {}
  lock<T>(repoId: string, fn: () => T): T {
    const owner = id();
    const resource = "git:" + repoId;
    this.store.sql
      .transaction(() => {
        if (
          this.store.sql
            .prepare("SELECT 1 FROM resource_leases WHERE resource=?")
            .get(resource)
        )
          throw new Error("Git cache is busy");
        this.store.sql
          .prepare("INSERT INTO resource_leases VALUES(?,?,?,?)")
          .run(resource, owner, 1, Date.now());
      })
      .immediate();
    try {
      return fn();
    } finally {
      this.store.sql
        .prepare("DELETE FROM resource_leases WHERE resource=? AND owner=?")
        .run(resource, owner);
    }
  }
  provision(run: Run) {
    const workspaces: Workspace[] = [];
    for (const repo of run.config.project.repositories) {
      if (sourceIdentity(repo.sourcePath) !== repo.sourceIdentity)
        throw new Error("Source identity changed since onboarding");
      const repositoryId = digest(repo.sourcePath).slice(0, 24),
        cache = join(this.store.root, "repos", repositoryId + ".git"),
        path = join(this.store.root, "runs", run.id, "worktrees", repo.key);
      const pinned = run.config.pins.find((p) => p.repoKey === repo.key);
      if (!pinned) throw new Error("Missing immutable repository pin");
      const branch = `agent/${run.taskId}/${run.id}/${repo.key}`;
      this.lock(repositoryId, () => {
        mkdirSync(dirname(cache), { recursive: true });
        if (!existsSync(cache))
          git(this.store.root, [
            "clone",
            "--bare",
            "--no-hardlinks",
            "--no-local",
            "--",
            repo.sourcePath,
            cache,
          ]);
        try {
          git(cache, ["cat-file", "-e", pinned.headSha + "^{commit}"]);
          git(cache, ["cat-file", "-e", pinned.baselineSha + "^{commit}"]);
        } catch {
          git(cache, [
            "fetch",
            "--no-tags",
            "--",
            repo.sourcePath,
            pinned.headSha,
            pinned.baselineSha,
          ]);
        }
        if (!existsSync(path)) {
          mkdirSync(dirname(path), { recursive: true });
          git(cache, ["worktree", "add", "-b", branch, path, pinned.headSha]);
        } else if (git(path, ["rev-parse", "--abbrev-ref", "HEAD"]) !== branch)
          throw new Error("Worktree ownership mismatch");
      });
      const files = git(path, ["ls-files", "-z"]).split("\0").filter(Boolean);
      if (files.some(forbidden))
        throw new Error(
          "Repository contains sensitive or active agent configuration files; approve a sanitized source before onboarding.",
        );
      for (const file of Object.keys(fileMap(path)))
        if (sensitiveContent(readFileSync(safePath(path, file))))
          throw new Error(
            "BLOCKED: potential credential in source; provide a sanitized source before agent access: " +
              file,
          );
      const workspace = {
        repoKey: repo.key,
        repositoryId,
        path,
        sourcePath: repo.sourcePath,
        branch,
        baselineSha: pinned.baselineSha,
        headSha: pinned.headSha,
        sourceDirty: pinned.sourceDirty,
      };
      this.store.put("run_repositories", {
        ...workspace,
        id: `${run.id}-${repo.key}`,
        runId: run.id,
      });
      workspaces.push(workspace);
      if (pinned.sourceDirty)
        this.store.event(
          run.id,
          "warning",
          `${repo.key}: source contains uncommitted work; only committed SHA imported.`,
        );
    }
    return workspaces;
  }
  checkpoint(run: Run, workspaces: Workspace[]): Snapshot {
    const files: Snapshot["files"] = {},
      diffs: Snapshot["diffs"] = {};
    const repositories = workspaces.map((workspace) => {
      const map = fileMap(workspace.path);
      files[workspace.repoKey] = map;
      this.lock(workspace.repositoryId, () => {
        const tracked = git(workspace.path, ["ls-files", "-z"])
          .split("\0")
          .filter(Boolean);
        if (tracked.some(forbidden))
          throw new Error(
            "Sensitive or active configuration file staged by implementer; checkpoint rejected",
          );
        const paths = [...new Set([...tracked, ...Object.keys(map)])].filter(
          (p) => !forbidden(p),
        );
        if (paths.length) git(workspace.path, ["add", "-A", "--", ...paths]);
        if (git(workspace.path, ["ls-files", "-z"]).split("\0").some(forbidden))
          throw new Error("Forbidden path in checkpoint index");
        if (git(workspace.path, ["diff", "--cached", "--name-only"]))
          git(workspace.path, [
            "-c",
            "user.name=AI Delivery Hub",
            "-c",
            "user.email=checkpoint@localhost",
            "commit",
            "-m",
            `Hub checkpoint ${run.id}`,
          ]);
      });
      const headSha = resolveRef(workspace.path, "HEAD");
      const changed = git(workspace.path, [
        "diff",
        "--name-only",
        "-z",
        workspace.baselineSha,
        headSha,
        "--",
      ])
        .split("\0")
        .filter((p) => p && !forbidden(p));
      diffs[workspace.repoKey] = changed.length
        ? git(workspace.path, [
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            workspace.baselineSha,
            headSha,
            "--",
            ...changed,
          ])
        : "";
      return { ...workspace, headSha };
    });
    const planHash = digest({
      task: run.config.task,
      project: run.config.project,
      pins: run.config.pins,
      reviewGuidance: run.config.reviewGuidance,
    });
    const snapshot: Snapshot = {
      id: id(),
      runId: run.id,
      createdAt: now(),
      digest: digest({
        repositories: repositories.map((r) => ({
          repoKey: r.repoKey,
          headSha: r.headSha,
          baselineSha: r.baselineSha,
        })),
        planHash,
        files,
      }),
      planHash,
      repositories,
      diffs,
      files,
    };
    this.store.put("snapshots", snapshot);
    this.store.updateRun(run.id, { snapshotId: snapshot.id });
    this.store.event(
      run.id,
      "snapshot",
      `Pinned assembly ${snapshot.digest.slice(0, 12)}`,
    );
    return snapshot;
  }
  assertUnchanged(snapshot: Snapshot) {
    for (const repo of snapshot.repositories)
      if (
        digest(fileMap(repo.path)) !== digest(snapshot.files[repo.repoKey]) ||
        resolveRef(repo.path, "HEAD") !== repo.headSha
      )
        throw new Error("Source snapshot changed during checks");
  }
  exportReview(run: Run, snapshot: Snapshot) {
    this.assertUnchanged(snapshot);
    if (sensitiveContent(JSON.stringify(snapshot.diffs)))
      throw new Error(
        "Potential credential in review diff; sanitize source history before review",
      );
    const root = join(
      this.store.root,
      "runs",
      run.id,
      "review",
      snapshot.id,
      id(),
    );
    mkdirSync(root, { recursive: true });
    for (const repo of snapshot.repositories) {
      for (const rel of Object.keys(snapshot.files[repo.repoKey]!)) {
        const target = safePath(root, join(repo.repoKey, rel), false);
        if (sensitiveContent(readFileSync(safePath(repo.path, rel))))
          throw new Error("Potential credential in review context: " + rel);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, readFileSync(safePath(repo.path, rel)), {
          mode: 0o444,
        });
      }
    }
    writeFileSync(
      join(root, "manifest.json"),
      JSON.stringify(
        {
          snapshotId: snapshot.id,
          digest: snapshot.digest,
          repositories: snapshot.repositories.map((r) => ({
            repoKey: r.repoKey,
            headSha: r.headSha,
          })),
          diffs: snapshot.diffs,
        },
        null,
        2,
      ),
      { mode: 0o444 },
    );
    function readonly(path: string) {
      for (const f of readdirSync(path, { withFileTypes: true }))
        if (f.isDirectory()) readonly(join(path, f.name));
      chmodSync(path, 0o555);
    }
    readonly(root);
    return root;
  }
  cleanup(run: Run) {
    if (
      !run.archived ||
      !["cancelled", "failed", "verified"].includes(run.state)
    )
      throw new Error("Cleanup requires an archived terminal run");
    const workspaces = this.store
      .list<Workspace & { runId: string; id: string }>("run_repositories")
      .filter((w) => w.runId === run.id);
    for (const w of workspaces) {
      const expected = join(
        this.store.root,
        "runs",
        run.id,
        "worktrees",
        w.repoKey,
      );
      if (w.path !== expected || !inside(this.store.root, w.path))
        throw new Error("Cleanup manifest mismatch");
      if (!existsSync(w.path)) continue;
      if (git(w.path, ["status", "--porcelain"]))
        throw new Error("Uncheckpointed work is protected");
      if (git(w.path, ["rev-parse", "--abbrev-ref", "HEAD"]) !== w.branch)
        throw new Error("Cleanup ownership mismatch");
      this.lock(w.repositoryId, () =>
        git(join(this.store.root, "repos", w.repositoryId + ".git"), [
          "worktree",
          "remove",
          "--",
          w.path,
        ]),
      );
    }
  }
}
