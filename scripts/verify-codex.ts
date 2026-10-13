// Explicit live CLI verification. Never invoked by the automated test suite.
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  copyFileSync,
  readFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type {
  Run,
  Task,
  Project,
  ReviewRound,
  ScenarioResult,
} from "../packages/contracts/src/index";
const origin = "http://127.0.0.1:" + (process.env.HUB_PORT || "3000");
const output = resolve("evidence/codex-live");
mkdirSync(output, { recursive: true });
const session = await fetch(origin + "/api/v1/session");
if (!session.ok) throw new Error("Local hub session unavailable");
const cookie = session.headers
  .getSetCookie()
  .map((s) => s.split(";")[0])
  .join("; ");
const { csrf } = z.object({ csrf: z.string() }).parse(await session.json());
async function api<T>(
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const response = await fetch(origin + "/api/v1/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Cookie: cookie,
      Origin: origin,
      "x-hub-csrf": csrf,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data: unknown = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data as T;
}
const selection = {
  provider: "codex-cli",
  model: process.env.HUB_CODEX_MODEL || "gpt-6.1-sol",
  effort: process.env.HUB_CODEX_EFFORT || "low",
  timeoutSeconds: 120,
  maxTurns: null,
};
if (process.argv.slice(2).some((arg) => arg !== "--review-only"))
  throw new Error("Only --review-only is supported");
if (!process.argv.includes("--review-only")) {
  const job = await api<{ id: string }>(
    "providers/codex-cli/test-connection",
    selection,
  );
  console.log("Explicit live Codex smoke:", job.id, selection.model);
  let smoke: unknown;
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    const state = await api<{
      jobs: { id: string; state: string }[];
      providers: { provider: string }[];
      notices: unknown[];
    }>("state");
    const current = state.jobs.find((j) => j.id === job.id);
    if (current && ["done", "failed"].includes(current.state)) {
      smoke = {
        checkedAt: new Date().toISOString(),
        selection,
        job: current,
        profile: state.providers.find((p) => p.provider === "codex-cli"),
        notices: state.notices.slice(0, 3),
      };
      writeFileSync(
        resolve(output, "smoke.json"),
        JSON.stringify(smoke, null, 2) + "\n",
      );
      if (current.state !== "done")
        throw new Error(
          "Live smoke failed; see evidence/codex-live/smoke.json",
        );
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!smoke) throw new Error("Live smoke did not complete before deadline");
}
const state = await api<{ projects: Project[] }>("state");
const project = state.projects.find((p) => p.demo);
if (!project)
  throw new Error("Run pnpm demo using the hub's HUB_DATA_DIR first");
const task = await api<Task>("change-sets", {
  projectId: project.id,
  title: "Live Codex review · demo registration and contracts",
  criteria:
    "Review the exact synthetic demo snapshot across all three repositories. Verify registration persists through the backend and the same participant appears in admin, and baseline clients retain the displayName contract. This is a local loopback demonstration, not a production event service. Report concrete defects and missing evidence honestly. Do not edit source or execute commands. Native coverage is optional and must remain NOT_RUN without a device/build.",
  mode: "review_qa",
  reviewer: { ...selection, timeoutSeconds: 180 },
  implementer: { ...selection, timeoutSeconds: 180 },
  maxReviewRounds: 1,
  maxRunMinutes: 6,
});
const run = await api<Run>(
  `change-sets/${task.id}/runs`,
  {},
  { "Idempotency-Key": "codex-live-" + task.id },
);
console.log("Live review_qa run:", run.id);
type Detail = {
  run: Run;
  reviews: ReviewRound[];
  results: ScenarioResult[];
  processes: { state: string }[];
  steps: { role?: string }[];
  snapshot: unknown;
  gates: unknown;
  events: unknown[];
};
let completed: Detail | undefined;
const runDeadline = Date.now() + 400000;
while (Date.now() < runDeadline) {
  const detail = await api<Detail>("runs/" + run.id);
  if (
    !["queued", "running"].includes(detail.run.state) &&
    detail.processes.every((p) => p.state === "exited")
  ) {
    completed = detail;
    break;
  }
  await new Promise((r) => setTimeout(r, 1000));
}
if (!completed)
  throw new Error("Live review run timed out; inspect run " + run.id);
const evidenceFile = resolve(output, "review-qa.json");
if (existsSync(evidenceFile)) {
  const prior = z
    .object({ run: z.object({ id: z.string().uuid() }) })
    .parse(JSON.parse(readFileSync(evidenceFile, "utf8")));
  copyFileSync(
    evidenceFile,
    resolve(output, "review-qa-" + prior.run.id + ".json"),
  );
}
writeFileSync(
  evidenceFile,
  JSON.stringify(
    { checkedAt: new Date().toISOString(), ...completed },
    null,
    2,
  ) + "\n",
);
if (completed.steps.some((s) => s.role === "implementer"))
  throw new Error("Review-only invoked an implementer");
if (!completed.reviews.length)
  throw new Error("No valid live review: " + completed.run.error);
if (
  !completed.results.some(
    (r) => r.scenarioId === "registration" && r.status === "passed",
  )
)
  throw new Error("Real registration QA did not pass");
console.log(
  JSON.stringify(
    {
      runId: run.id,
      snapshotId: completed.run.snapshotId,
      state: completed.run.state,
      verdict: completed.reviews[0]?.review.verdict,
      findings: completed.reviews[0]?.review.findings.length,
      actualModels: completed.reviews[0]?.actualModels,
      gates: completed.gates,
      scenarios: completed.results.map(({ scenarioId, status }) => ({
        scenarioId,
        status,
      })),
    },
    null,
    2,
  ),
);
