import { Store } from "../packages/db/src/index";
import { generateDemo } from "../packages/test-fixtures/src/generate";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { hash } from "../packages/core/src/paths";
const s = new Store();
const project = generateDemo(s);
const guide = realpathSync(resolve("tests/fixtures/review-guide.md"));
s.put("projects", {
  ...project,
  repositories: project.repositories.map((r) => ({
    ...r,
    issuePrefixes: r.key === "monorepo" ? ["DEMO"] : [],
  })),
  reviewSkills: [
    {
      id: "demo-review-guide",
      title: "Demo review guide",
      trigger: "repository_change",
      repoKeys: ["monorepo"],
      sources: [{ path: guide, sha256: hash(readFileSync(guide)) }],
      requiredContextKeys: ["demo-missing-context"],
    },
  ],
});
s.close();
process.argv[2] = process.env.HUB_E2E_PRODUCTION === "1" ? "start" : "dev";
await import("./launch");
