import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import schema from "../../../contracts/qa-result.schema.json";
import { Store } from "../../db/src/index";
import type {
  Run,
  Snapshot,
  ScenarioResult,
  Command,
} from "../../contracts/src/index";
import { safePath, id, now, hash } from "../../core/src/paths";
import { Processes } from "./process";
import { saveResult } from "./qa";
import { git, GitWorkspaces } from "./git";
import { artifactRoot, registerArtifact } from "./artifacts";
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);
export interface QaEnvelope {
  schemaVersion: string;
  runId: string;
  snapshotId: string;
  source: string;
  runner: string;
  exitCode: number | null;
  results: {
    scenarioId: string;
    status: ScenarioResult["status"];
    expected: string;
    observed: string;
    assertions: ScenarioResult["assertions"];
    evidenceIds: string[];
    attempt: number;
    durationMs: number;
  }[];
}
export function parseQa(
  value: unknown,
  runId: string,
  snapshotId: string,
  exitCode: number | null,
): QaEnvelope {
  if (!validate(value)) throw new Error("Invalid QA report schema");
  const report = value as unknown as QaEnvelope;
  if (report.runId !== runId || report.snapshotId !== snapshotId)
    throw new Error("Stale QA report");
  if (report.source !== "runner")
    throw new Error("Automated result requires runner provenance");
  if (!report.results.length) throw new Error("Empty test suite");
  for (const result of report.results) {
    if (
      result.status === "passed" &&
      (exitCode !== 0 ||
        report.exitCode !== 0 ||
        !result.assertions.length ||
        result.assertions.some((a) => !a.passed))
    )
      throw new Error("Passed result lacks successful assertions");
  }
  return report;
}
export async function contractCheck(
  store: Store,
  run: Run,
  snapshot: Snapshot,
  processes: Processes,
  signal: AbortSignal,
) {
  const runner = fileURLToPath(
    new URL("../../test-fixtures/src/contract-runner.mjs", import.meta.url),
  );
  const baselineContracts = snapshot.repositories
    .filter((r) => r.repoKey !== "monorepo")
    .map((r) => ({
      repoKey: r.repoKey,
      ...(JSON.parse(
        git(r.path, ["show", r.baselineSha + ":contract.json"]),
      ) as { field: string }),
    }));
  const result = await processes.run(
    run.id,
    "contract",
    process.execPath,
    [
      runner,
      JSON.stringify({
        repositories: snapshot.repositories,
        baselineContracts,
      }),
    ],
    { cwd: store.root, signal, timeoutMs: 10000 },
  );
  const parsed = z
    .object({
      status: z.enum(["passed", "failed"]),
      assertions: z
        .array(z.object({ description: z.string(), passed: z.boolean() }))
        .min(1),
      observed: z.string(),
    })
    .parse(JSON.parse(result.stdout));
  saveResult(
    store,
    run,
    snapshot,
    "contract",
    result.code === 0 &&
      parsed.status === "passed" &&
      parsed.assertions.every((a) => a.passed)
      ? "passed"
      : "failed",
    parsed.observed,
    {
      runner: "node:assert/strict · rollout matrix",
      assertions: parsed.assertions,
      exitCode: result.code,
    },
  );
}
export function commandInput(
  command: Command,
  snapshot: Snapshot,
  run: Run,
  variables: Record<string, string> = {},
) {
  const repo = snapshot.repositories.find((r) => r.repoKey === command.repoKey);
  if (!repo) throw new Error("Unknown command repository");
  const cwd = safePath(repo.path, command.cwd);
  const vars: Record<string, string> = {
    "run.id": run.id,
    "snapshot.id": snapshot.id,
    "paths.worktree": repo.path,
    ...Object.fromEntries(
      snapshot.repositories.map((r) => ["revisions." + r.repoKey, r.headSha]),
    ),
    ...variables,
  };
  const render = (arg: string) =>
    arg.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
      if (!(key in vars)) throw new Error("Unknown command placeholder");
      return vars[key]!;
    });
  const references: Record<string, string> = {};
  for (const ref of command.envRefs) {
    if (/^(PATH|HOME|NODE_OPTIONS|NODE_PATH|LD_.*|DYLD_.*|HUB_.*)$/.test(ref))
      throw new Error("Reserved QA environment reference");
    const value = process.env["HUB_QA_" + ref];
    if (!value)
      throw new Error("QA credential is not configured: HUB_QA_" + ref);
    references[ref] = value;
  }
  return {
    cwd,
    executable: command.executable,
    args: command.args.map(render),
    env: {
      ...references,
      HUB_RUN_ID: run.id,
      HUB_SNAPSHOT_ID: snapshot.id,
      HUB_RUNTIME_DIR: variables["paths.runtime"] || "",
      HUB_RUNTIME_PORTS: JSON.stringify(
        Object.fromEntries(
          Object.entries(variables).filter(([k]) => k.startsWith("ports.")),
        ),
      ),
    },
  };
}
export async function approvedChecks(
  store: Store,
  run: Run,
  snapshot: Snapshot,
  processes: Processes,
  signal: AbortSignal,
  acquire?: <T>(resources: string[], fn: () => Promise<T>) => Promise<T>,
  phase: "repo" | "qa" = "repo",
  variables: Record<string, string> = {},
) {
  for (const command of run.config.project.commands.filter(
    (c) => c.kind !== "start" && c.phase === phase,
  )) {
    const input = commandInput(command, snapshot, run, variables);
    const execute = () =>
      processes.run(
        run.id,
        "check:" + command.id,
        input.executable,
        input.args,
        { ...input, timeoutMs: command.timeoutSeconds * 1000, signal },
      );
    const start = Date.now();
    const result = acquire
      ? await acquire(
          [
            ...command.resourceIds.map((r) => "exclusive:" + r),
            ...(command.kind === "build" ? ["build"] : []),
          ],
          execute,
        )
      : await execute();
    new GitWorkspaces(store).assertUnchanged(snapshot);
    let status: ScenarioResult["status"] =
        result.code === 0 ? "passed" : "failed",
      observed =
        result.code === 0
          ? "Approved command completed successfully."
          : result.stderr;
    if (command.kind === "suite") {
      try {
        if (!command.reportPath)
          throw new Error("Suite requires a normalized QA report");
        const report = parseQa(
          JSON.parse(
            readFileSync(safePath(input.cwd, command.reportPath), "utf8"),
          ),
          run.id,
          snapshot.id,
          result.code,
        );
        const evidence = new Map<string, string>();
        for (const spec of command.artifacts) {
          const from = safePath(input.cwd, spec.path);
          if (statSync(from).size > 20 * 1024 * 1024)
            throw new Error("Runner artifact exceeds size limit");
          const bytes = readFileSync(from);
          const extension = extname(spec.path).toLowerCase();
          if (
            ![
              ".png",
              ".zip",
              ".webm",
              ".mp4",
              ".json",
              ".html",
              ".txt",
              ".xml",
            ].includes(extension)
          )
            throw new Error("Unsupported runner artifact format");
          if (/(?:storage.?state|cookies|auth|\.env)/i.test(spec.path))
            throw new Error("Sensitive runner artifact path");
          const filename = `check-${command.id}-${spec.id}-${hash(bytes).slice(0, 16)}${extension}`;
          const path = safePath(
            artifactRoot(store, run, snapshot.id),
            filename,
            false,
          );
          try {
            writeFileSync(path, bytes, { flag: "wx" });
          } catch (error) {
            if (hash(readFileSync(path)) !== hash(bytes)) throw error;
          }
          const artifact = registerArtifact(store, run, snapshot.id, filename, {
            scenarioId: spec.scenarioId,
            surfaceKey: spec.surfaceKey,
            author: report.runner,
          });
          evidence.set(spec.id, artifact.id);
        }
        for (const item of report.results) {
          const scenario = run.config.project.scenarios.find(
            (s) => s.id === item.scenarioId && s.commandId === command.id,
          );
          if (!scenario)
            throw new Error("Report includes a scenario outside locked scope");
          if (
            item.evidenceIds.some(
              (id) =>
                !evidence.has(id) ||
                !command.artifacts.some(
                  (a) => a.id === id && a.scenarioId === item.scenarioId,
                ),
            )
          )
            throw new Error(
              "Report evidence is outside approved artifact scope",
            );
          saveResult(
            store,
            run,
            snapshot,
            item.scenarioId,
            item.status,
            item.observed,
            {
              runner: report.runner,
              assertions: item.assertions,
              durationMs: item.durationMs,
              attempt: item.attempt,
              exitCode: result.code,
              evidenceIds: item.evidenceIds.map((id) => evidence.get(id)!),
            },
          );
        }
        status = report.results.every((r) => r.status === "passed")
          ? "passed"
          : "failed";
      } catch (error) {
        status = "blocked";
        observed = String(error);
      }
    }
    store.put("scenario_results", {
      id: id(),
      runId: run.id,
      snapshotId: snapshot.id,
      scenarioId: "check:" + command.id,
      status,
      source: "runner",
      runner: command.executable,
      expected: "Approved " + command.kind + " " + command.id,
      observed,
      assertions: [
        { description: "Process exit code is zero", passed: result.code === 0 },
      ],
      evidenceIds: [],
      durationMs: Date.now() - start,
      attempt: 1,
      createdAt: now(),
      exitCode: result.code,
    } satisfies ScenarioResult);
  }
}
export function testScope(snapshot: Snapshot, locked: Record<string, string>) {
  for (const [key, expected] of Object.entries(locked)) {
    const [repoKey, ...rest] = key.split("/");
    const repo = snapshot.repositories.find((r) => r.repoKey === repoKey);
    if (!repo) throw new Error("Missing locked repository");
    try {
      if (
        hash(
          readFileSync(safePath(repo.path, rest.join("/")), "utf8").trimEnd(),
        ) !== expected
      )
        throw new Error("Changed");
    } catch {
      throw new Error(
        "Required test changed; new human-approved scope required: " + key,
      );
    }
  }
}
