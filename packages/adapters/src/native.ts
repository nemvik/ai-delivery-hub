import { execFileSync } from "node:child_process";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Store } from "../../db/src/index";
import type { Run, Snapshot } from "../../contracts/src/index";
import { Processes } from "./process";
import { artifactRoot, registerArtifact } from "./artifacts";
import { saveResult } from "./qa";
import { commandInput } from "./checks";
import { childEnv, safePath } from "../../core/src/paths";
export function maestroJUnit(xml: string) {
  if (xml.length > 10 * 1024 * 1024)
    throw new Error("Native report exceeds limit");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("XML entities forbidden");
  if (XMLValidator.validate(xml) !== true)
    throw new Error("Malformed JUnit XML");
  const document: unknown = new XMLParser({
    ignoreAttributes: false,
    processEntities: false,
    parseTagValue: false,
  }).parse(xml);
  if (
    !document ||
    typeof document !== "object" ||
    !("testsuite" in document || "testsuites" in document)
  )
    throw new Error("Invalid JUnit root");
  const cases: { name: string; status: "passed" | "failed" | "skipped" }[] = [];
  const array = (value: unknown): unknown[] =>
    value === undefined ? [] : Array.isArray(value) ? value : [value];
  function visit(value: unknown, depth: number) {
    if (depth > 30) throw new Error("JUnit nesting exceeds limit");
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    for (const raw of array(node.testcase)) {
      const test = (raw && typeof raw === "object" ? raw : {}) as Record<
        string,
        unknown
      >;
      cases.push({
        name:
          typeof test["@_name"] === "string"
            ? test["@_name"]
            : `case-${cases.length}`,
        status:
          "failure" in test || "error" in test
            ? "failed"
            : "skipped" in test
              ? "skipped"
              : "passed",
      });
    }
    for (const suite of [...array(node.testsuite), ...array(node.testsuites)])
      visit(suite, depth + 1);
  }
  visit(document, 0);
  if (!cases.length) throw new Error("Empty native suite");
  return cases;
}
export async function nativeQa(
  store: Store,
  run: Run,
  snapshot: Snapshot,
  processes: Processes,
  signal: AbortSignal,
) {
  const scenarios = run.config.project.scenarios.filter(
    (s) => s.kind === "native",
  );
  if (!scenarios.length) return;
  const config = run.config.project.native;
  const blocked = (why: string) =>
    scenarios.forEach((s) =>
      saveResult(store, run, snapshot, s.id, "not_run", why, {
        runner: "maestro",
      }),
    );
  if (!config) {
    blocked(
      "Native device/build/flow not configured. Library and web coverage are not native coverage.",
    );
    return;
  }
  try {
    if (
      !config.deviceId ||
      !config.buildFingerprint ||
      !config.runtimeVersion ||
      !config.revision
    )
      throw new Error("Native identity incomplete");
    const help = execFileSync(config.executable, ["test", "--help"], {
      env: childEnv(),
      encoding: "utf8",
      timeout: 10000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (const flag of ["--format", "--output"])
      if (!help.includes(flag))
        throw new Error("Unsupported Maestro capability " + flag);
    const globalHelp = execFileSync(config.executable, ["--help"], {
      env: childEnv(),
      encoding: "utf8",
      timeout: 10000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (!globalHelp.includes("--device"))
      throw new Error("Device pin capability unavailable");
    const verification = run.config.project.commands.find(
      (c) => c.id === config.verificationCommandId,
    );
    if (!verification)
      throw new Error("Onboard a native build/endpoint verification command");
    const input = commandInput(verification, snapshot, run);
    const verified = await processes.run(
      run.id,
      "native-identity",
      input.executable,
      input.args,
      { ...input, signal, timeoutMs: verification.timeoutSeconds * 1000 },
    );
    if (verified.code !== 0)
      throw new Error("Native build/device verification failed");
    const identity = JSON.parse(verified.stdout) as Record<string, string>;
    for (const key of [
      "deviceId",
      "applicationId",
      "buildFingerprint",
      "runtimeVersion",
      "revision",
      "endpoint",
    ] as const)
      if (identity[key] !== config[key])
        throw new Error("Native identity mismatch: " + key);
    const endpoint = new URL(config.endpoint);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname))
      throw new Error(
        "Only loopback native endpoints supported in v1; production endpoints prohibited",
      );
    const repo = snapshot.repositories.find(
      (r) => r.repoKey === verification.repoKey,
    )!;
    const flow = safePath(repo.path, config.flowPath);
    const output = artifactRoot(store, run, snapshot.id),
      report = join(output, "native.junit.xml");
    const result = await processes.run(
      run.id,
      "maestro",
      config.executable,
      [
        "--device",
        config.deviceId,
        "test",
        "--format",
        "junit",
        "--output",
        report,
        flow,
      ],
      { cwd: repo.path, signal, timeoutMs: 300000 },
    );
    if (!existsSync(report)) throw new Error("Maestro produced no report");
    const cases = maestroJUnit(readFileSync(report, "utf8")),
      artifact = registerArtifact(store, run, snapshot.id, "native.junit.xml", {
        author: "maestro",
        surfaceKey: config.platform,
      });
    for (const scenario of scenarios) {
      const names = config.testNamesByScenario[scenario.id];
      const selected = names
        ? cases.filter((c) => names.includes(c.name))
        : scenarios.length === 1
          ? cases
          : [];
      if (
        !selected.length ||
        (names && names.some((n) => !selected.some((c) => c.name === n)))
      ) {
        saveResult(
          store,
          run,
          snapshot,
          scenario.id,
          "not_run",
          "Native report does not cover the configured test names for this scenario.",
          { runner: "maestro", evidenceIds: [artifact.id] },
        );
        continue;
      }
      saveResult(
        store,
        run,
        snapshot,
        scenario.id,
        result.code === 0 && selected.every((c) => c.status === "passed")
          ? "passed"
          : result.code !== 0 || selected.some((c) => c.status === "failed")
            ? "failed"
            : "skipped",
        JSON.stringify({
          identity,
          platform: config.platform,
          cases: selected,
        }),
        {
          runner: "maestro",
          assertions: selected.map((c) => ({
            description: c.name,
            passed: c.status === "passed",
          })),
          evidenceIds: [artifact.id],
          exitCode: result.code,
        },
      );
    }
  } catch (error) {
    blocked(String(error));
  }
}
