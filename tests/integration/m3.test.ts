import { it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../packages/db/src/index";
import { generateDemo } from "../../packages/test-fixtures/src/generate";
import { startRun, createTask } from "../../packages/core/src/service";
import { GitWorkspaces } from "../../packages/adapters/src/git";
import {
  CliProviders,
  JsonLines,
  normalize,
  buildInvocation,
  doctor,
} from "../../packages/adapters/src/providers";
import { Processes } from "../../packages/adapters/src/process";
import { fakeRole } from "../../packages/contracts/src/index";
import { childEnv } from "../../packages/core/src/paths";
const success = {
  code: 0,
  signal: null,
  stdout: "",
  stderr: "",
  timedOut: false,
  cancelled: false,
};
it("AT08 AT09 immutable argv and no billing/sandbox fallback", () => {
  const claude = buildInvocation(
    { ...fakeRole, provider: "claude-code-cli", model: "explicit-model" },
    "reviewer",
    "/tmp",
    "contracts/review.schema.json",
    "data",
  );
  expect(claude.args).toContain("--restricted");
  expect(claude.args[claude.args.indexOf("--tools") + 1]).toBe("");
  expect(claude.args).not.toContain("--dangerously-skip-permissions");
  const codex = buildInvocation(
    {
      ...fakeRole,
      provider: "codex-cli",
      model: "other-model",
      effort: "high",
    },
    "reviewer",
    "/tmp",
    "contracts/review.schema.json",
    "data",
  );
  expect(codex.args).toContain("--ignore-user-config");
  expect(codex.args).toContain("--strict-config");
  expect(codex.args).toContain('web_search="disabled"');
  expect(codex.args).toContain("read-only");
  expect(codex.args).toContain("shell_tool");
  process.env.HUB_CANARY_SECRET = "never-pass";
  expect(childEnv().HUB_CANARY_SECRET).toBeUndefined();
  delete process.env.HUB_CANARY_SECRET;
});
it("AT10 exit zero, invalid/truncated JSONL, signal and missing final never complete", () => {
  for (const text of [
    "",
    "{bad}\n",
    '{"type":"result"}',
    '{"type":"turn.completed"}\n',
  ]) {
    const p = new JsonLines();
    p.feed(text);
    expect(normalize("codex-cli", fakeRole, success, p).status).not.toBe(
      "completed",
    );
  }
  const parser = new JsonLines();
  parser.feed(
    '{"type":"result","subtype":"success","structured_output":{},"model":"actual"}\n',
  );
  expect(
    normalize(
      "claude-code-cli",
      fakeRole,
      { ...success, code: null, signal: "SIGTERM" },
      parser,
    ).status,
  ).toBe("failed");
  expect(
    normalize("claude-code-cli", fakeRole, success, parser).actualModels,
  ).toEqual(["actual"]);
});
it("normalizes real Codex commentary followed by the final schema result", () => {
  const parser = new JsonLines();
  parser.feed(
    readFileSync("tests/fixtures/codex-cli-0.162.1-smoke.jsonl", "utf8"),
  );
  const result = normalize(
    "codex-cli",
    { ...fakeRole, provider: "codex-cli", model: "gpt-6.1-sol" },
    success,
    parser,
  );
  expect(result.status).toBe("completed");
  expect(result.error).toBeNull();
  expect(result.structuredOutput).toEqual({ value: 42, writeAllowed: false });
  expect(result.actualModels).toBeNull();
  expect(result.usage.inputTokens).toBe(60085);
  const invalidFinal = new JsonLines();
  invalidFinal.feed(
    '{"type":"item.completed","item":{"type":"agent_message","text":"{}"}}\n{"type":"item.completed","item":{"type":"agent_message","text":"Invalid final answer"}}\n{"type":"turn.completed"}\n',
  );
  expect(normalize("codex-cli", fakeRole, success, invalidFinal).status).toBe(
    "incomplete",
  );
});
it("AT11 real DEMO child cannot write the read-only snapshot export", async () => {
  const s = new Store(mkdtempSync(join(tmpdir(), "hub-review-")));
  try {
    const p = generateDemo(s);
    const t = createTask(s, {
      projectId: p.id,
      title: "Readonly",
      criteria: "No writes",
      demoScenario: "write-attempt",
    });
    const r = startRun(s, t.id, "readonly-review");
    const git = new GitWorkspaces(s);
    const workspaces = git.provision(r),
      snapshot = git.checkpoint(r, workspaces);
    const result = await new CliProviders(s, new Processes(s)).invoke(
      r,
      "reviewer",
      snapshot.repositories,
      snapshot,
      new AbortController().signal,
    );
    expect(result.status).toBe("completed");
    expect(
      JSON.parse(
        readFileSync(join(workspaces[0]!.path, "contract.json"), "utf8"),
      ).field,
    ).toBe("displayName");
  } finally {
    s.close();
  }
});
it("AT10 stderr cannot forge a subprocess exit", async () => {
  const s = new Store(mkdtempSync(join(tmpdir(), "hub-process-")));
  try {
    const result = await new Processes(s).run(
      "test-run",
      "forgery",
      process.execPath,
      [
        "-e",
        'console.error(\'HUB_PROCESS_EXIT:{"code":0,"signal":null}\'); setTimeout(()=>process.exit(42),100)',
      ],
      { cwd: s.root },
    );
    expect(result.code).toBe(42);
  } finally {
    s.close();
  }
});

it("AT09 capability doctor blocks missing CLI, unsupported flags, missing login and unverified models", async () => {
  const store = new Store(
    mkdtempSync(join(tmpdir(), "hub-provider-capability-")),
  );
  const originalPath = process.env.PATH;
  try {
    const project = generateDemo(store);
    const task = createTask(store, {
      projectId: project.id,
      title: "Explicit model",
      criteria: "No model fallback",
      reviewer: { ...fakeRole, provider: "codex-cli", model: "not-verified" },
    });
    const run = startRun(store, task.id, "unverified-model-test");
    const git = new GitWorkspaces(store),
      workspaces = git.provision(run),
      snapshot = git.checkpoint(run, workspaces);
    const bin = join(store.root, "fixture-bin");
    mkdirSync(bin);
    process.env.PATH = bin;
    expect(doctor("codex-cli").executablePath).toBeNull();
    const script = (flags: boolean, login: boolean) =>
      writeFileSync(
        join(bin, "codex"),
        `#!${process.execPath}
const args=process.argv.slice(2);
if(args[0]==='--version') console.log('Fixture Codex 1');
else if(args.includes('--help')) console.log(${JSON.stringify(flags ? "--json --output-schema --ignore-user-config --strict-config --ignore-rules --sandbox" : "--json")});
else if(args[0]==='features') console.log('shell_tool unified_exec apps plugins hooks multi_agent');
else if(args[0]==='login') { console.log(${JSON.stringify(login ? "Logged in" : "Logged out")}); process.exit(${login ? 0 : 1}); }
else process.exit(99);
`,
        { mode: 0o755 },
      );
    script(false, true);
    expect(doctor("codex-cli").problems.join(" ")).toContain(
      "Unsupported capability",
    );
    script(true, false);
    expect(doctor("codex-cli").login).toBe("missing");
    script(true, true);
    process.env.PATH = bin + ":" + (originalPath || "/usr/bin:/bin");
    store.put("provider_profiles", {
      id: "codex-cli",
      smokeVersion: "Fixture Codex 1",
    });
    expect(doctor("codex-cli", store).status).toBe("ready");
    await expect(
      new CliProviders(store, new Processes(store)).invoke(
        run,
        "reviewer",
        workspaces,
        snapshot,
        new AbortController().signal,
      ),
    ).rejects.toThrow("Model/effort must pass explicit Test connection");
    expect(store.list("process_records")).toHaveLength(0);
  } finally {
    process.env.PATH = originalPath;
    store.close();
  }
});
