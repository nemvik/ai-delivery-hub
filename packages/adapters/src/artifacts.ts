import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Store } from "../../db/src/index";
import type { Run, Artifact } from "../../contracts/src/index";
import { now, hash, digest, safePath } from "../../core/src/paths";
export function artifactRoot(store: Store, run: Run, snapshotId: string) {
  const directory = join(
    store.root,
    "artifacts",
    run.projectId,
    run.taskId,
    run.id,
    snapshotId,
  );
  mkdirSync(directory, { recursive: true });
  return directory;
}
export function registerArtifact(
  store: Store,
  run: Run,
  snapshotId: string,
  name: string,
  options: Partial<Artifact> = {},
) {
  const root = artifactRoot(store, run, snapshotId);
  const file = safePath(root, name);
  const buffer = readFileSync(file);
  const mime = name.endsWith(".png")
    ? "image/png"
    : name.endsWith(".zip")
      ? "application/zip"
      : name.endsWith(".webm")
        ? "video/webm"
        : name.endsWith(".mp4")
          ? "video/mp4"
          : name.endsWith(".html")
            ? "text/html"
            : name.endsWith(".json")
              ? "application/json"
              : "text/plain";
  const artifact: Artifact = {
    id: digest({ run: run.id, snapshotId, name, hash: hash(buffer) }),
    runId: run.id,
    snapshotId,
    relativePath: name,
    sha256: hash(buffer),
    sizeBytes: buffer.length,
    mimeType: mime,
    source: run.config.project.demo ? "demo" : "runner",
    scenarioId: null,
    surfaceKey: null,
    author: "controller",
    sensitivity: run.config.project.demo ? "synthetic" : "review_required",
    createdAt: now(),
    ...options,
  };
  return store.put("artifacts", artifact);
}
