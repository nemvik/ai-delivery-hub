// Explicit read-only onboarding of the three selected Happenee repositories.
// Generates configuration; does not run tests, install packages, or create a run.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { projectSchema } from "../packages/contracts/src/index";
import { git, resolveRef, sourceIdentity } from "../packages/adapters/src/git";
import { freezeReviewGuidance } from "../packages/core/src/review-skills";
import { hash } from "../packages/core/src/paths";

const root = realpathSync(
  resolve(process.env.HAPPENEE_ROOT || join(homedir(), "Projects/Happenee")),
);
const skillRoot = resolve(
  process.env.HAPPENEE_SKILLS_ROOT || join(homedir(), ".codex/skills"),
);
const definitions = [
  {
    key: "mobile",
    directory: "happenee-mobile-app",
    baselineRef: "refs/remotes/origin/master",
    issuePrefixes: ["MOB"],
  },
  {
    key: "service",
    directory: "happenee-service-app",
    baselineRef: "refs/remotes/origin/main",
    issuePrefixes: ["SERV"],
  },
  {
    key: "platform",
    directory: "happeneeServer/happeneeServer",
    baselineRef: "refs/remotes/origin/main",
    issuePrefixes: ["PLAT"],
  },
];
const inventory = definitions.map((r) => {
  const sourcePath = realpathSync(join(root, r.directory));
  sourceIdentity(sourcePath);
  const packageJson = join(sourcePath, "package.json");
  const metadata = existsSync(packageJson)
    ? (JSON.parse(readFileSync(packageJson, "utf8")) as {
        packageManager?: string;
        engines?: unknown;
        scripts?: unknown;
      })
    : undefined;
  return {
    key: r.key,
    sourcePath,
    baselineRef: r.baselineRef,
    baselineSha: resolveRef(sourcePath, r.baselineRef),
    headSha: resolveRef(sourcePath, "HEAD"),
    branch: git(sourcePath, ["branch", "--show-current"]),
    dirtyStatus: git(sourcePath, ["status", "--porcelain"]),
    manifestSource: "Current checkout, not executed",
    packageManager:
      metadata?.packageManager ||
      (existsSync(join(sourcePath, "yarn.lock"))
        ? "yarn (lockfile v1)"
        : "composer"),
    engines: metadata?.engines,
    availableScripts: metadata?.scripts,
  };
});
function source(path: string) {
  const canonical = realpathSync(join(skillRoot, path));
  return { path: canonical, sha256: hash(readFileSync(canonical)) };
}
const role = {
  provider: "codex-cli",
  model: process.env.HUB_CODEX_MODEL || "gpt-6.1-sol",
  effort: process.env.HUB_CODEX_EFFORT || "low",
  timeoutSeconds: 600,
  maxTurns: null,
};
const config = projectSchema.parse({
  name: "Happenee",
  trusted: true,
  demo: false,
  defaultRoles: { implementer: role, reviewer: role },
  repositories: definitions.map((r, i) => ({
    key: r.key,
    sourcePath: inventory[i]!.sourcePath,
    baselineRef: r.baselineRef,
    issuePrefixes: r.issuePrefixes,
  })),
  surfaces: [
    { key: "whitelabel-ios", repoKey: "mobile", kind: "native_ios" },
    { key: "whitelabel-android", repoKey: "mobile", kind: "native_android" },
    { key: "service-ios", repoKey: "service", kind: "native_ios" },
    { key: "service-android", repoKey: "service", kind: "native_android" },
    { key: "admin", repoKey: "platform", kind: "web", cwd: "admin" },
    { key: "live", repoKey: "platform", kind: "web", cwd: "live" },
    { key: "public", repoKey: "platform", kind: "web", cwd: "public" },
    { key: "crm", repoKey: "platform", kind: "web", cwd: "crm" },
    { key: "microsite", repoKey: "platform", kind: "web", cwd: "." },
    { key: "api", repoKey: "platform", kind: "api", cwd: "." },
  ],
  reviewSkills: [
    {
      id: "happenee-review-task",
      title: "Happenee Review Task",
      trigger: "task_or_change",
      repoKeys: ["mobile", "service", "platform"],
      sources: [source("happenee-review-task/SKILL.md")],
      requiredContextKeys: ["company-os", "customer-kb", "technical-docs"],
    },
    {
      id: "happenee-cross-repo-pr-review",
      title: "Happenee Cross Repo PR Review",
      trigger: "repository_change",
      repoKeys: ["platform"],
      sources: [
        source("happenee-cross-repo-pr-review/SKILL.md"),
        source("happenee-cross-repo-pr-review/references/happenee-repos.md"),
        source(
          "happenee-cross-repo-pr-review/references/knowledge-and-governance.md",
        ),
      ],
      requiredContextKeys: ["company-os", "technical-docs"],
    },
  ],
  reviewContext: [],
  commands: [],
  scenarios: [
    {
      id: "happenee-contract",
      title: "Backend + existing mobile and service clients",
      kind: "contract",
      surfaceKeys: ["api", "whitelabel-ios", "service-android"],
      expected:
        "Approve a deterministic contract suite over selected revisions and isolated synthetic data.",
    },
    {
      id: "happenee-web",
      title: "Affected web surfaces",
      kind: "web",
      surfaceKeys: ["admin", "live", "public", "crm", "microsite"],
      expected:
        "Onboard selected loopback runtime commands, identity/readiness and a real browser suite.",
    },
    {
      id: "happenee-native",
      title: "Selected native build and device",
      kind: "native",
      required: false,
      surfaceKeys: [
        "whitelabel-ios",
        "whitelabel-android",
        "service-ios",
        "service-android",
      ],
      expected:
        "Onboard one specific app/platform, device, build identity, isolated endpoint, credentials and Maestro flow for the task.",
    },
  ],
  onboardingNotes: [
    "MOB = whitelabel mobile app; SERV = service app; PLAT = platform monorepo. Baselines are local origin refs; no fetch was performed. Select an explicit branch/SHA for a prepared change. Dirty source changes are not imported.",
    "QA NOT_RUN: no approved company commands, credentials, isolated database, runtime or native device/build. No company test or install is started by this preset. PHP 8.3 is required by platform instructions; never use production happenee or write to shared happenee_dev.",
    "Skills run automatically only inside an explicitly started review. Their read-only checklists are adapted to hub output; no GitHub comment, PR, publication or Linear write. Company OS, customer KB and technical docs require explicit context onboarding; missing evidence blocks a complete skill verdict.",
    "The current reviewer has a bounded 700,000-character inline context and rejects secrets/oversized source files. Whole-company monorepo review has not been verified; a pilot requires a suitable scoped source export. This preset is not a completed company pilot.",
    "Microsite is a platform surface, not a separately verified project directory/start command. Native configuration supports one verified target per project/run; prepare a scoped profile before testing a specific app and platform.",
  ],
  allowNetwork: false,
  allowInstall: false,
});
freezeReviewGuidance({
  ...config,
  id: "onboarding-preview",
  createdAt: new Date().toISOString(),
});
mkdirSync(resolve("config"), { recursive: true });
mkdirSync(resolve("evidence/happenee"), { recursive: true });
writeFileSync(
  resolve("config/happenee.project.json"),
  JSON.stringify(config, null, 2) + "\n",
);
writeFileSync(
  resolve("evidence/happenee/onboarding-inventory.json"),
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      root,
      repositories: inventory,
      companyTests: "NOT_RUN",
      externalContext: "NOT_ONBOARDED",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Prepared config/happenee.project.json; verified three Git roots and pinned skill hashes. No company tests or runs started.",
);
