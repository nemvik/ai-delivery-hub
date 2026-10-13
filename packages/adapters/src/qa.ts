import net from "node:net";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "../../db/src/index";
import { Processes } from "./process";
import { id, now, safePath } from "../../core/src/paths";
import type { Run, Snapshot, ScenarioResult } from "../../contracts/src/index";
import { artifactRoot, registerArtifact } from "./artifacts";
export { artifactRoot, registerArtifact } from "./artifacts";
export async function freePort() {
  return new Promise<number>((resolve, reject) => {
    const s = net.createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });
}
export async function readiness(
  url: string,
  runId: string,
  signal: AbortSignal,
  timeout = 10000,
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (signal.aborted) throw new Error("Cancelled");
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      const body = (await response.json()) as { runId?: string };
      if (response.ok && body.runId === runId) return;
      if (response.ok) throw new Error("Readiness identity mismatch");
    } catch (error) {
      if (String(error).includes("identity mismatch")) throw error;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Readiness timeout");
}
export function saveResult(
  store: Store,
  run: Run,
  snapshot: Snapshot,
  scenarioId: string,
  status: ScenarioResult["status"],
  observed: string,
  extra: Partial<ScenarioResult> = {},
) {
  const scenario = run.config.project.scenarios.find(
    (s) => s.id === scenarioId,
  );
  return store.put("scenario_results", {
    id: id(),
    runId: run.id,
    snapshotId: snapshot.id,
    scenarioId,
    status,
    source: run.config.project.demo ? "demo" : "runner",
    runner: "controller",
    expected: scenario?.expected || scenarioId,
    observed,
    assertions: [],
    evidenceIds: [],
    durationMs: 0,
    attempt: 1,
    createdAt: now(),
    exitCode: null,
    ...extra,
  } satisfies ScenarioResult);
}
export async function webQa(
  store: Store,
  run: Run,
  snapshot: Snapshot,
  processes: Processes,
  signal: AbortSignal,
) {
  const workspace = snapshot.repositories.find((r) => r.repoKey === "monorepo");
  if (!run.config.project.demo || !workspace) {
    saveResult(
      store,
      run,
      snapshot,
      "registration",
      "not_run",
      "Configure an approved web QA command in onboarding.",
    );
    return;
  }
  const output = artifactRoot(store, run, snapshot.id),
    runtime = join(store.root, "runs", run.id, "runtime");
  mkdirSync(runtime, { recursive: true });
  const port = await freePort();
  const manifest = {
    runId: run.id,
    snapshotId: snapshot.id,
    port,
    database: join(runtime, "qa.sqlite"),
    seed: run.id,
    account: `demo-${run.id}`,
    cachePrefix: run.id,
    uploadPrefix: run.id,
  };
  store.put("steps", {
    id: id(),
    runId: run.id,
    type: "runtime",
    manifest,
    createdAt: now(),
  });
  const serverController = new AbortController();
  const cancel = () => serverController.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const server = processes.run(
    run.id,
    "web-server",
    process.execPath,
    [
      join(workspace.path, "server.mjs"),
      String(port),
      manifest.database,
      run.id,
      String(run.config.task.demoScenario === "web-fail"),
    ],
    { cwd: workspace.path, signal: serverController.signal, timeoutMs: 120000 },
  );
  try {
    await readiness(`http://127.0.0.1:${port}/health`, run.id, signal);
    const runner = fileURLToPath(new URL("./web-runner.ts", import.meta.url));
    const result = await processes.run(
      run.id,
      "web-qa",
      process.execPath,
      [
        "--import",
        "tsx",
        runner,
        `http://127.0.0.1:${port}`,
        output,
        run.id,
        snapshot.id,
      ],
      {
        cwd: fileURLToPath(new URL("../../../", import.meta.url)),
        signal,
        timeoutMs: 60000,
      },
    );
    if (!existsSync(join(output, "result.json")))
      throw new Error(`Runner did not produce a result: ${result.stderr}`);
    const raw = JSON.parse(
      readFileSync(join(output, "result.json"), "utf8"),
    ) as {
      runId: string;
      snapshotId: string;
      status: string;
      observed: string;
      assertions: ScenarioResult["assertions"];
      files: { name: string; surface: string }[];
      durationMs: number;
    };
    if (raw.runId !== run.id || raw.snapshotId !== snapshot.id)
      throw new Error("Stale QA result");
    const artifacts = raw.files
      .filter((f) => existsSync(safePath(output, f.name, false)))
      .map((f) =>
        registerArtifact(store, run, snapshot.id, f.name, {
          scenarioId: "registration",
          surfaceKey: f.surface,
          author: "playwright",
        }),
      );
    const passed =
      result.code === 0 &&
      raw.status === "passed" &&
      raw.assertions.length >= 2 &&
      raw.assertions.every((a) => a.passed);
    saveResult(
      store,
      run,
      snapshot,
      "registration",
      passed ? "passed" : "failed",
      raw.observed,
      {
        runner: "playwright",
        assertions: raw.assertions,
        evidenceIds: artifacts.map((a) => a.id),
        durationMs: raw.durationMs,
        exitCode: result.code,
      },
    );
  } catch (error) {
    saveResult(store, run, snapshot, "registration", "blocked", String(error), {
      runner: "playwright",
    });
    if (signal.aborted) throw error;
  } finally {
    serverController.abort();
    await server;
    signal.removeEventListener("abort", cancel);
  }
}
