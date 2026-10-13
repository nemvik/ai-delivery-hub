// Read-only check of a folder the user typed during explicit project setup.
// Runs only git plumbing that reads refs; nothing that hashes working files
// (which could run repository-defined filters) or rewrites the index.
import { existsSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import type { RepositoryInspection } from "../../contracts/src/index";
import { inside } from "../../core/src/paths";
import { git } from "./git";

const HUB_INTERNAL = ["repos", "runs", "artifacts", "exports"];

export function assertOutsideHubData(hubRoot: string, realPath: string) {
  if (HUB_INTERNAL.some((dir) => inside(join(hubRoot, dir), realPath)))
    throw new Error("This folder belongs to the hub's own data");
}

export function inspectRepository(
  hubRoot: string,
  rawPath: string,
): RepositoryInspection {
  let path = rawPath.trim();
  if (path === "~") path = homedir();
  else if (path.startsWith("~/")) path = join(homedir(), path.slice(2));
  if (!isAbsolute(path) || path.includes("\0"))
    throw new Error("Enter an absolute path, for example ~/Projects/my-app");
  if (!existsSync(path)) throw new Error("Folder does not exist");
  if (!statSync(path).isDirectory())
    throw new Error("This is a file, not a folder");
  const real = realpathSync(path);
  assertOutsideHubData(hubRoot, real);
  let top: string;
  try {
    top = realpathSync(git(real, ["rev-parse", "--show-toplevel"]).trim());
  } catch {
    throw new Error("This folder is not a Git repository");
  }
  if (top !== real) throw new Error(`Choose the repository root: ${top}`);
  try {
    const branches = git(real, [
      "for-each-ref",
      "--format=%(refname:short)",
      "--count=500",
      "refs/heads",
      "refs/remotes",
    ])
      .split("\n")
      .map((b) => b.trim())
      .filter((b) => b && !b.endsWith("/HEAD"));
    const suggestedKey =
      basename(real)
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/^[-_]+/, "")
        .slice(0, 80) || "repo";
    return {
      path: real,
      currentBranch: git(real, ["branch", "--show-current"]).trim() || null,
      branches,
      suggestedKey,
    };
  } catch {
    throw new Error("Couldn't read the branches of this repository");
  }
}
