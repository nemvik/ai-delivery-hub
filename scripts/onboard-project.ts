import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { projectSchema, type Project } from "../packages/contracts/src/index";
import { Store } from "../packages/db/src/index";
import { createProject } from "../packages/core/src/service";
import { freezeReviewGuidance } from "../packages/core/src/review-skills";
import { digest } from "../packages/core/src/paths";
import { sourceIdentity } from "../packages/adapters/src/git";
const file = process.argv[2];
if (!file)
  throw new Error(
    "Usage: pnpm exec tsx scripts/onboard-project.ts config/happenee.project.json",
  );
const config = projectSchema.parse(
  JSON.parse(readFileSync(resolve(file), "utf8")),
);
const store = new Store();
try {
  const existing = store
    .list<Project>("projects")
    .find((p) => p.name === config.name);
  if (existing) {
    const { id: _id, createdAt: _createdAt, ...old } = existing;
    void _id;
    void _createdAt;
    const normalize = (p: typeof config) => ({
      ...p,
      repositories: p.repositories.map(
        ({ sourceIdentity: _identity, ...r }) => {
          void _identity;
          return r;
        },
      ),
    });
    if (
      digest(normalize(projectSchema.parse(old))) !== digest(normalize(config))
    )
      throw new Error(
        "A different project with this name exists. Review its settings and use a new profile name; existing run configuration is preserved.",
      );
    for (const repo of existing.repositories)
      if (sourceIdentity(repo.sourcePath) !== repo.sourceIdentity)
        throw new Error(
          "Source directory identity changed; review the replacement and onboard a new profile.",
        );
    freezeReviewGuidance(existing);
    console.log(
      JSON.stringify({
        projectId: existing.id,
        name: existing.name,
        state: "already_registered",
        runsStarted: 0,
      }),
    );
  } else {
    const project = createProject(store, config);
    console.log(
      JSON.stringify({
        projectId: project.id,
        name: project.name,
        state: "registered",
        runsStarted: 0,
      }),
    );
  }
} finally {
  store.close();
}
