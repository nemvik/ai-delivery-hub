import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  renameSync,
  existsSync,
  realpathSync,
  readdirSync,
  statSync,
  rmSync,
} from "node:fs";
import { join, relative, resolve, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { Store } from "../../db/src/index";
import type {
  Run,
  Snapshot,
  Artifact,
  ScenarioResult,
  ReviewRound,
  QaFinding,
} from "../../contracts/src/index";
import { artifactRoot, registerArtifact } from "./artifacts";
import { gates } from "../../core/src/gates";
import {
  id,
  now,
  digest,
  hash,
  safePath,
  inside,
  escapeHtml,
  redact,
  sensitiveContent,
} from "../../core/src/paths";
export interface Destination {
  id: string;
  name: string;
  path: string;
  identity: string;
  createdAt: string;
}
export function sensitive(buffer: Buffer) {
  return sensitiveContent(buffer);
}
export function publishable(file: string, artifact: Artifact) {
  if (artifact.sensitivity !== "synthetic")
    throw new Error(
      "Artifact requires sensitivity review; publication blocked",
    );
  if (artifact.sizeBytes > 20 * 1024 * 1024)
    throw new Error("Artifact exceeds publication size limit");
  const content = readFileSync(file);
  if (hash(content) !== artifact.sha256)
    throw new Error("Artifact hash mismatch");
  if (sensitive(content)) throw new Error("Sensitive artifact blocked");
  if (artifact.mimeType === "application/zip") {
    const names = execFileSync("/usr/bin/unzip", ["-Z1", file], {
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (/storage.?state|\.env|auth\.json|cookies/i.test(names))
      throw new Error("Sensitive trace entries blocked");
    const expanded = execFileSync("/usr/bin/unzip", ["-p", file], {
      timeout: 10000,
      maxBuffer: 30 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (sensitive(expanded))
      throw new Error(
        "Sensitive trace blocked; binary archives are not text-redacted",
      );
  }
  return content;
}
export function registerDestination(store: Store, name: string, path: string) {
  const canonical = realpathSync(path);
  if (inside(store.root, canonical) || inside(canonical, store.root))
    throw new Error(
      "Destination must be outside hub data and source artifacts",
    );
  for (const project of store.list<{ repositories: { sourcePath: string }[] }>(
    "projects",
  ))
    for (const r of project.repositories)
      if (inside(r.sourcePath, canonical) || inside(canonical, r.sourcePath))
        throw new Error("Destination cannot overlap source repositories");
  const st = statSync(canonical);
  if (!st.isDirectory()) throw new Error("Destination must be a directory");
  return store.put("publisher_destinations", {
    id: id(),
    name,
    path: canonical,
    identity: `${st.dev}:${st.ino}`,
    createdAt: now(),
  } satisfies Destination);
}
export function createReport(store: Store, run: Run, snapshot: Snapshot) {
  const root = artifactRoot(store, run, snapshot.id);
  const artifacts = store
    .list<Artifact>("artifacts")
    .filter(
      (a) =>
        a.runId === run.id &&
        a.snapshotId === snapshot.id &&
        a.author !== "controller-report",
    );
  const approvals = store
    .list<{ runId: string }>("human_approvals")
    .filter((a) => a.runId === run.id);
  const decisions = store
    .list<{ runId: string }>("finding_decisions")
    .filter((a) => a.runId === run.id);
  const results = store
    .list<ScenarioResult>("scenario_results")
    .filter((r) => r.runId === run.id);
  const reviews = store
    .list<ReviewRound>("review_rounds")
    .filter((r) => r.runId === run.id);
  const qaFindings = store
    .list<QaFinding>("findings")
    .filter((f) => f.runId === run.id && f.source === "qa");
  const revision = digest({
    artifacts,
    state: run.state,
    stale: run.stale,
    approvals,
    decisions,
    results,
    reviews,
    qaFindings,
    error: run.error,
  });
  const reportDirectory = join(root, "reports", revision);
  const manifestPath = join(reportDirectory, "manifest.json");
  if (existsSync(manifestPath))
    return JSON.parse(readFileSync(manifestPath, "utf8")) as EvidenceManifest;
  mkdirSync(reportDirectory, { recursive: true });
  // The revision's timestamps must survive a crash before manifest commit.
  const generatedAt = [
    ...artifacts.map((a) => a.createdAt),
    ...results.map((r) => r.createdAt),
    ...reviews.map((r) => r.createdAt),
    snapshot.createdAt,
  ]
    .sort()
    .at(-1)!;
  const report = {
    schemaVersion: "1.0",
    runId: run.id,
    snapshotId: snapshot.id,
    generatedAt,
    label: run.config.project.demo
      ? "DEMO · SYNTHETIC DATA"
      : "ONBOARDED PRODUCT",
    title: run.config.task.title,
    state: run.state,
    stale: run.stale,
    publication: "local_only",
    publicationNote:
      "Collection status. A published package includes publication.json with its receipt.",
    decisions,
    criteria: redact(run.config.task.criteria),
    snapshot: {
      digest: snapshot.digest,
      planHash: snapshot.planHash,
      repositories: snapshot.repositories.map((r) => ({
        repoKey: r.repoKey,
        baselineSha: r.baselineSha,
        headSha: r.headSha,
        sourceDirty: r.sourceDirty,
      })),
    },
    providers: {
      implementer: run.config.task.implementer,
      reviewer: run.config.task.reviewer,
    },
    gates: gates(store, run, snapshot),
    reviews,
    qaFindings,
    results,
    artifacts,
    blockers: run.error ? [redact(run.error)] : [],
    rollout:
      "Use the contract matrix for new backend + baseline clients. No deployment was performed.",
    humanApprovals: approvals,
  };
  const writeImmutable = (name: string, content: string) => {
    const path = safePath(reportDirectory, name, false);
    if (existsSync(path)) {
      if (readFileSync(path, "utf8") !== content)
        throw new Error("Report revision integrity failure");
    } else {
      const pending = safePath(reportDirectory, name + ".pending", false);
      writeFileSync(pending, content);
      renameSync(pending, path);
    }
  };
  writeImmutable("report.json", JSON.stringify(report, null, 2));
  const h = escapeHtml;
  const screenshots = artifacts
    .filter((a) => a.mimeType === "image/png")
    .map((a) => {
      const bytes = readFileSync(safePath(root, a.relativePath));
      if (hash(bytes) !== a.sha256) throw new Error("Corrupt screenshot");
      return `<figure><img alt="${h(a.surfaceKey)}" src="data:image/png;base64,${bytes.toString("base64")}"><figcaption>${h(a.source)} / ${h(a.surfaceKey)} / ${h(a.scenarioId)}<br>${h(a.sha256)}</figcaption></figure>`;
    })
    .join("");
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${h(report.title)} · Delivery Hub</title><style>body{font:15px/1.6 system-ui;max-width:1080px;margin:50px auto;padding:24px;color:#253e31;background:#f6f7f0}h1{font:42px Georgia}table{width:100%;border-collapse:collapse;background:white}td,th{border:1px solid #d9e0d2;padding:12px;text-align:left}small,code{overflow-wrap:anywhere}figure{margin:24px 0;background:white;padding:16px}img{max-width:100%}figcaption{font:11px monospace;overflow-wrap:anywhere}.status{font:bold 18px monospace}pre{white-space:pre-wrap}</style><small>${h(report.label)} / ${h(run.id)}</small><h1>${h(report.title)}</h1><p class="status">${h(run.state)} · ${h(report.publication)}</p><p>${h(report.criteria)}</p><p>Snapshot ${h(snapshot.id)} · ${h(snapshot.digest)}</p><h2>Exact assembly</h2><table><tr><th>Repository</th><th>Baseline SHA</th><th>Tested SHA</th></tr>${snapshot.repositories.map((r) => `<tr><td>${h(r.repoKey)}</td><td><code>${h(r.baselineSha)}</code></td><td><code>${h(r.headSha)}</code></td></tr>`).join("")}</table><h2>Executed checks and remaining coverage</h2><table><tr><th>Scenario / snapshot</th><th>Status</th><th>Observed</th></tr>${results.map((r) => `<tr><td>${h(r.scenarioId)}<br><small>${h(r.snapshotId)}</small></td><td>${h(r.status)} / ${h(r.source)}</td><td>${h(redact(r.observed))}<br><small>${h(r.runner)} · ${r.durationMs} ms</small></td></tr>`).join("")}</table><h2>Independent reviews</h2>${reviews.map((r) => `<h3>Round ${r.round}: ${h(r.review.verdict)}</h3><p>${h(r.review.summary)}</p>${r.review.findings.map((f) => `<p><b>${h(f.severity)} ${h(f.title)}</b> ${h(f.description)}<br><code>${h(f.repoKey)}/${h(f.path)}:${h(f.startLine)}</code></p>`).join("")}`).join("") || "<p>Review was not completed or not part of this run.</p>"}<h2>Evidence</h2>${screenshots}<h2>Human steps & blockers</h2><pre>${h(JSON.stringify({ gates: report.gates, blockers: report.blockers, approvals: report.humanApprovals, decisions: report.decisions }, null, 2))}</pre><p>${h(report.rollout)}</p><p>No visual baseline is configured. Manual evidence never creates an automated PASS.</p></html>`;
  writeImmutable("index.html", html);
  for (const name of ["report.json", "index.html"])
    artifacts.push(
      registerArtifact(
        store,
        run,
        snapshot.id,
        join("reports", revision, name),
        {
          author: "controller-report",
          createdAt: generatedAt,
          sensitivity: artifacts.every((a) => a.sensitivity === "synthetic")
            ? "synthetic"
            : "review_required",
        },
      ),
    );
  const manifest: EvidenceManifest = {
    schemaVersion: "1.0",
    runId: run.id,
    snapshotId: snapshot.id,
    projectId: run.projectId,
    taskId: run.taskId,
    snapshotDigest: snapshot.digest,
    generatedAt,
    artifacts: artifacts.map((a) =>
      a.author === "controller-report"
        ? { ...a, relativePath: basename(a.relativePath) }
        : a,
    ),
  };
  writeImmutable("manifest.json", JSON.stringify(manifest, null, 2));
  return manifest;
}
export interface EvidenceManifest {
  schemaVersion: string;
  runId: string;
  snapshotId: string;
  projectId: string;
  taskId: string;
  snapshotDigest: string;
  generatedAt: string;
  artifacts: Artifact[];
}
export function publishReport(store: Store, run: Run, destinationId: string) {
  if (!run.snapshotId || ["running", "queued"].includes(run.state))
    throw new Error("Publish requires a terminal snapshot");
  if (
    store
      .list<{ runId: string; state: string }>("process_records")
      .some((p) => p.runId === run.id && p.state !== "exited")
  )
    throw new Error("Publish requires confirmed process cleanup");
  const destination = store.get<Destination>(
    "publisher_destinations",
    destinationId,
  );
  if (!destination) throw new Error("Destination not approved");
  const st = statSync(destination.path);
  if (
    realpathSync(destination.path) !== destination.path ||
    `${st.dev}:${st.ino}` !== destination.identity
  )
    throw new Error("Destination identity changed");
  const snapshot = store.get<Snapshot>("snapshots", run.snapshotId)!;
  const manifest = createReport(store, run, snapshot),
    manifestHash = digest(manifest),
    key = digest({
      destinationId,
      runId: run.id,
      snapshotId: snapshot.id,
      manifestHash,
    });
  const previous = store.get<{
    id: string;
    runId: string;
    location: string;
    manifestHash: string;
  }>("publish_receipts", key);
  const source = artifactRoot(store, run, snapshot.id);
  const rel = join(
    "delivery-hub",
    run.projectId,
    run.taskId,
    run.id,
    snapshot.id,
    manifestHash.slice(0, 16),
  );
  const target = safePath(destination.path, rel, false);
  const temp = safePath(destination.path, rel + ".pending", false);
  const verify = (path: string) => {
    if (
      digest(
        JSON.parse(readFileSync(safePath(path, "manifest.json"), "utf8")),
      ) !== manifestHash
    )
      throw new Error("Published manifest integrity failure");
    for (const a of manifest.artifacts)
      if (hash(readFileSync(safePath(path, a.relativePath))) !== a.sha256)
        throw new Error("Published artifact integrity failure");
  };
  if (previous) {
    verify(previous.location);
    store.updateRun(run.id, { publication: "published" });
    return previous;
  }
  store.put("publish_jobs", {
    id: key,
    runId: run.id,
    snapshotId: snapshot.id,
    destinationId,
    manifestHash,
    state: "running",
    createdAt: now(),
  });
  try {
    if (existsSync(target)) {
      verify(target);
    } else {
      mkdirSync(temp, { recursive: true });
      for (const a of manifest.artifacts) {
        const registered = store.get<Artifact>("artifacts", a.id);
        if (!registered) throw new Error("Artifact registration missing");
        const from = safePath(source, registered.relativePath),
          to = safePath(temp, a.relativePath, false);
        publishable(from, a);
        mkdirSync(resolve(to, ".."), { recursive: true });
        copyFileSync(from, to);
        if (hash(readFileSync(to)) !== a.sha256)
          throw new Error("Copied artifact hash mismatch");
      }
      writeFileSync(
        join(temp, "manifest.json"),
        JSON.stringify(manifest, null, 2),
      );
      verify(temp);
      renameSync(temp, target);
    }
    const receipt = {
      id: key,
      runId: run.id,
      snapshotId: snapshot.id,
      destinationId,
      manifestHash,
      location: target,
      publishedAt: now(),
    };
    writeFileSync(
      join(target, "publication.json"),
      JSON.stringify({ ...receipt, status: "published" }, null, 2),
    );
    store.put("publish_receipts", receipt);
    store.put("publish_jobs", {
      id: key,
      runId: run.id,
      state: "published",
      createdAt: now(),
    });
    store.updateRun(run.id, { publication: "published" });
    store.event(run.id, "published", target);
    return receipt;
  } catch (error) {
    store.put("publish_jobs", {
      id: key,
      runId: run.id,
      state: "publish_failed",
      error: redact(String(error)),
      createdAt: now(),
    });
    store.updateRun(run.id, { publication: "publish_failed" });
    throw error;
  }
}
export function diskUsage(root: string): number {
  if (!existsSync(root)) return 0;
  let bytes = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const path = join(root, entry.name);
    bytes += entry.isDirectory() ? diskUsage(path) : statSync(path).size;
  }
  return bytes;
}
export function retentionPreview(store: Store) {
  const days = store.settings().maxAgeDays;
  return store
    .list<Run>("runs")
    .filter(
      (r) =>
        r.archived &&
        !r.evidenceExpiredAt &&
        !r.pinned &&
        r.state === "verified" &&
        Date.now() - Date.parse(r.updatedAt) > days * 86400000,
    )
    .map((r) => ({
      runId: r.id,
      bytes: diskUsage(
        join(store.root, "artifacts", r.projectId, r.taskId, r.id),
      ),
      path: relative(
        store.root,
        join(store.root, "artifacts", r.projectId, r.taskId, r.id),
      ),
    }));
}
export function cleanupEvidence(store: Store, run: Run) {
  if (run.evidenceExpiredAt) return;
  const candidate = retentionPreview(store).find((c) => c.runId === run.id);
  if (!candidate) throw new Error("Run is protected by retention policy");
  if (
    store
      .list<{ runId: string; state: string }>("process_records")
      .some((p) => p.runId === run.id && p.state !== "exited")
  )
    throw new Error("Run processes are not reconciled");
  const path = safePath(store.root, candidate.path, false);
  rmSync(path, { recursive: true, force: true });
  store.updateRun(run.id, { evidenceExpiredAt: now() });
  store.event(
    run.id,
    "evidence_expired",
    "User removed archived evidence under the configured retention policy. Source worktrees and published copies retained.",
  );
}
