import {
  mkdirSync,
  existsSync,
  copyFileSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { sourceIdentity } from "../../adapters/src/git";
import { Store } from "../../db/src/index";
import {
  projectSchema,
  taskSchema,
  type Project,
} from "../../contracts/src/index";
import { now, id, childEnv } from "../../core/src/paths";
export function generateDemo(store: Store) {
  const existing = store.list<Project>("projects").find((p) => p.demo);
  if (existing) return existing;
  const root = join(store.root, "fixtures");
  mkdirSync(root, { recursive: true });
  const repositories = ["monorepo", "client", "service"].map((key) => {
    const path = join(root, "fixture-" + key);
    mkdirSync(path, { recursive: true });
    if (!existsSync(join(path, ".git"))) {
      writeFileSync(
        join(path, "contract.json"),
        JSON.stringify({ field: "displayName" }, null, 2) + "\n",
      );
      writeFileSync(
        join(path, "README.md"),
        `# DEMO ${key}\nSynthetic test fixture, not a native application.\n`,
      );
      if (key === "monorepo")
        copyFileSync(
          fileURLToPath(new URL("./demo-server.mjs", import.meta.url)),
          join(path, "server.mjs"),
        );
      for (const args of [
        ["init", "-b", "main"],
        ["add", "."],
        [
          "-c",
          "user.name=Hub Demo",
          "-c",
          "user.email=demo@localhost",
          "-c",
          "core.hooksPath=/dev/null",
          "commit",
          "-m",
          "Initial synthetic fixture",
        ],
      ])
        execFileSync("git", args, {
          cwd: path,
          env: childEnv(),
          stdio: "pipe",
        });
    }
    return {
      key,
      sourcePath: realpathSync(path),
      sourceIdentity: sourceIdentity(realpathSync(path)),
      baselineRef: "main",
    };
  });
  const project = store.put("projects", {
    ...projectSchema.parse({
      name: "Summit · Demo product",
      trusted: true,
      demo: true,
      repositories,
      surfaces: [
        { key: "live", repoKey: "monorepo", kind: "web" },
        { key: "admin", repoKey: "monorepo", kind: "web" },
        { key: "client", repoKey: "client", kind: "library" },
        { key: "service", repoKey: "service", kind: "library" },
      ],
      scenarios: [
        {
          id: "registration",
          title: "Registration → admin",
          kind: "web",
          surfaceKeys: ["live", "admin"],
          expected: "The same registered participant appears in admin.",
        },
        {
          id: "contract",
          title: "Backward compatible clients",
          kind: "contract",
          surfaceKeys: ["client", "service"],
          expected: "New backend and existing clients agree on displayName.",
        },
        {
          id: "native",
          title: "Native device",
          kind: "native",
          required: false,
          surfaceKeys: ["client"],
          expected: "Onboard a prepared native build and device.",
        },
      ],
    }),
    id: id(),
    createdAt: now(),
  });
  store.put("change_sets", {
    ...taskSchema.parse({
      projectId: project.id,
      title: "Verify registration across the product",
      criteria:
        "Registration persists through the backend and the same participant appears in admin. Keep existing client contracts compatible.",
      mode: "qa_only",
    }),
    id: id(),
    createdAt: now(),
  });
  return project;
}
