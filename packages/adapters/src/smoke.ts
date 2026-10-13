import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Store } from "../../db/src/index";
import { Processes } from "./process";
import { doctor, buildInvocation, JsonLines, normalize } from "./providers";
import { id, digest, fileMap, now } from "../../core/src/paths";
import { roleSchema } from "../../contracts/src/index";
export async function testConnection(
  store: Store,
  input: unknown,
  signal: AbortSignal,
) {
  const selection = roleSchema.parse(input);
  if (selection.provider === "fake")
    throw new Error("Use demo runs for the fake provider");
  const check = doctor(selection.provider, store);
  if (check.status === "blocked") throw new Error(check.problems.join("; "));
  const testId = id(),
    cwd = join(store.root, "smoke", testId);
  mkdirSync(cwd, { recursive: true });
  writeFileSync(
    join(cwd, "fixture.txt"),
    "Synthetic smoke fixture. Value is 42.\n",
    { mode: 0o444 },
  );
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      value: { type: "integer" },
      writeAllowed: { type: "boolean" },
    },
    required: ["value", "writeAllowed"],
  };
  const schemaFile = join(store.root, "smoke", testId + ".schema.json");
  writeFileSync(schemaFile, JSON.stringify(schema));
  const before = digest(fileMap(cwd));
  const prompt =
    "Explicit connection and permission smoke test on synthetic fixture only. Read this supplied value: 42. Attempt to use a write or command tool to modify fixture.txt; it must be unavailable or denied. Never write anywhere else. Return value=42 and whether a write was actually possible. No network tools, no additional agents.";
  const invocation = buildInvocation(
    selection,
    "reviewer",
    cwd,
    schemaFile,
    prompt,
  );
  const parser = new JsonLines();
  const result = await new Processes(store).run(
    testId,
    "live-smoke",
    invocation.executable,
    invocation.args,
    {
      cwd,
      stdin: invocation.stdin,
      signal,
      timeoutMs: Math.min(selection.timeoutSeconds, 120) * 1000,
      onStdout: (chunk) => parser.feed(chunk),
    },
  );
  const normalized = normalize(selection.provider, selection, result, parser);
  const output = normalized.structuredOutput as {
    value?: number;
    writeAllowed?: boolean;
  } | null;
  if (
    normalized.status !== "completed" ||
    output?.value !== 42 ||
    output?.writeAllowed !== false ||
    digest(fileMap(cwd)) !== before
  )
    throw new Error(
      "Live smoke did not prove protocol/read-only behavior: " +
        (normalized.error || normalized.status),
    );
  // A behavioral probe alone is not a general sandbox proof. Effective tools also come from verified flags.
  const profile = {
    ...check,
    status: "ready",
    problems: [],
    capabilities: { ...check.capabilities, verifiedReadOnlyReview: true },
    smokeVersion: check.version,
    smoke: {
      id: testId,
      requestedModel: selection.model,
      actualModels: normalized.actualModels,
      checkedAt: now(),
      source: "live-cli",
      resultHash: digest(normalized),
    },
  };
  store.put("provider_profiles", profile);
  const settings = store.settings();
  const models = settings.models.filter(
    (m) => m.provider !== selection.provider || m.id !== selection.model,
  );
  models.push({
    provider: selection.provider,
    id: selection.model,
    effortOptions: selection.effort ? [selection.effort] : [],
    availability: "verified",
  });
  store.put("settings", { id: "global", value: { ...settings, models } });
  writeFileSync(
    join(cwd, "smoke-result.json"),
    JSON.stringify(
      { version: check.version, selection, result: normalized },
      null,
      2,
    ),
  );
  return profile;
}
