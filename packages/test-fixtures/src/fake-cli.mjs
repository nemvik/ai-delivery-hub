import { randomUUID } from "node:crypto";
// Explicit DEMO subprocess. No real provider claims are produced here.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
let stdin = "";
for await (const c of process.stdin) stdin += c;
const c = JSON.parse(stdin);
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");
if (c.scenario === "hang")
  await new Promise(() => {
    setInterval(() => {}, 1000);
  });
if (c.scenario === "crash") process.exit(9);
if (c.scenario === "invalid-json") {
  console.log("{invalid");
  process.exit(0);
}
if (c.scenario === "incomplete-jsonl") {
  process.stdout.write('{"type":"result"');
  process.exit(0);
}
if (c.scenario === "signal") process.kill(process.pid, "SIGTERM");
let output;
if (c.role === "implementer") {
  if (["contract-defect", "limit"].includes(c.scenario)) {
    for (const w of c.workspaces.filter((w) =>
      ["monorepo", "client"].includes(w.repoKey),
    )) {
      writeFileSync(
        join(w.path, "contract.json"),
        JSON.stringify(
          {
            field:
              c.phase === "fix" && c.scenario !== "limit"
                ? "displayName"
                : "name",
          },
          null,
          2,
        ) + "\n",
      );
    }
    if (c.phase === "initial")
      writeFileSync(
        join(c.workspaces[0].path, "implementation.txt"),
        "DEMO fixture change\n",
      );
  }
  output = {
    summary: "DEMO deterministic implementation",
    addressedFindingIds: c.prior?.findings.map((f) => f.localId) || [],
  };
} else {
  if (c.scenario === "write-attempt") {
    try {
      writeFileSync(join(c.workspaces[0].path, "contract.json"), "bad");
      emit({ type: "error", message: "Write incorrectly allowed" });
      process.exit(2);
    } catch {
      emit({
        type: "progress",
        message: "DEMO write denied by filesystem permissions",
      });
    }
  }
  const findings = [];
  for (const w of c.workspaces) {
    const contract = JSON.parse(
      readFileSync(join(w.path, "contract.json"), "utf8"),
    );
    if (contract.field !== "displayName")
      findings.push({
        localId: `contract-${w.repoKey}`,
        priorFindingId:
          c.prior?.findings.find((f) => f.repoKey === w.repoKey)?.localId ||
          null,
        severity: "P1",
        category: "compatibility",
        title: "Existing clients lose displayName",
        description:
          "The changed contract removes a field used by existing clients.",
        repoKey: w.repoKey,
        path: "contract.json",
        startLine: 2,
        evidence: `contract.json declares ${contract.field}; the locked compatibility test requires displayName.`,
        suggestedFix: "Preserve displayName.",
        suggestedVerification:
          "Run the immutable old-client compatibility matrix.",
      });
  }
  output = {
    schemaVersion: "1.0",
    snapshotId: c.snapshotId,
    verdict: findings.length ? "changes_requested" : "pass",
    summary: "DEMO independent file-based review",
    reviewedRepositories: c.workspaces.map((w) => ({
      repoKey: w.repoKey,
      headSha: w.headSha,
    })),
    findings,
    coverageGaps: [],
    qaSuggestions: [],
  };
  if (c.scenario === "coverage-gap") output.reviewedRepositories.pop();
}
emit({
  type: "result",
  subtype: "success",
  is_error: false,
  model: "demo-deterministic",
  session_id: randomUUID(),
  structured_output: output,
});
