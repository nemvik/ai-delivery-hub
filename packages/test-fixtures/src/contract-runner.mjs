import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const { repositories, baselineContracts } = JSON.parse(process.argv[2]);
const assertions = [];
let status = "passed";
for (const repo of repositories) {
  try {
    const current = JSON.parse(
      readFileSync(repo.path + "/contract.json", "utf8"),
    );
    assert.equal(current.field, "displayName");
    assertions.push({
      description: repo.repoKey + " preserves displayName",
      passed: true,
    });
  } catch (error) {
    status = "failed";
    assertions.push({
      description: repo.repoKey + ": " + error.message,
      passed: false,
    });
  }
}
for (const old of baselineContracts) {
  try {
    const backend = JSON.parse(
      readFileSync(
        repositories.find((r) => r.repoKey === "monorepo").path +
          "/contract.json",
        "utf8",
      ),
    );
    assert.equal(backend.field, old.field);
    assertions.push({
      description: "new backend + baseline " + old.repoKey,
      passed: true,
    });
  } catch (error) {
    status = "failed";
    assertions.push({
      description: "Rollout compatibility: " + error.message,
      passed: false,
    });
  }
}
console.log(
  JSON.stringify({
    status,
    assertions,
    observed:
      status === "passed"
        ? "All components and baseline clients retain displayName."
        : "Contract mismatch in component or baseline-client matrix.",
  }),
);
process.exitCode = status === "passed" ? 0 : 1;
