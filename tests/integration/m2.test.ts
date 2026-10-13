import { it, expect } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../../packages/db/src/index";
import { generateDemo } from "../../packages/test-fixtures/src/generate";
import { startRun } from "../../packages/core/src/service";
import { GitWorkspaces, git } from "../../packages/adapters/src/git";
import type { Task } from "../../packages/contracts/src/index";
it("AT03–AT07 pins, dirty sources, independent worktrees, complete snapshots and safe cleanup", () => {
  const s = new Store(mkdtempSync(join(tmpdir(), "hub-git-")));
  try {
    const p = generateDemo(s),
      task = s.list<Task>("change_sets")[0]!,
      source = p.repositories[0]!.sourcePath;
    writeFileSync(join(source, "untracked.txt"), "keep");
    writeFileSync(join(source, "staged.txt"), "keep");
    git(source, ["add", "staged.txt"]);
    writeFileSync(join(source, "README.md"), "unstaged user work");
    const before = git(source, ["status", "--porcelain"]);
    const a = startRun(s, task.id, "first-run-key"),
      b = startRun(s, task.id, "second-run-key");
    const g = new GitWorkspaces(s);
    const wa = g.provision(a),
      wb = g.provision(b);
    expect(wa).toHaveLength(3);
    expect(new Set([...wa, ...wb].map((x) => x.path)).size).toBe(6);
    expect(wa.every((w) => !existsSync(join(w.path, "staged.txt")))).toBe(true);
    writeFileSync(join(wa[0]!.path, "contract.json"), '{"field":"name"}');
    writeFileSync(join(wa[0]!.path, "new.ts"), "export const value=1;");
    unlinkSync(join(wa[0]!.path, "README.md"));
    writeFileSync(join(wa[0]!.path, ".env"), "SECRET=canary");
    writeFileSync(join(wb[0]!.path, "contract.json"), '{"field":"other"}');
    const sa = g.checkpoint(a, wa),
      sb = g.checkpoint(b, wb);
    expect(sa.diffs.monorepo).toContain("new.ts");
    expect(sa.diffs.monorepo).toContain("deleted file");
    expect(sa.diffs.monorepo).not.toContain("canary");
    expect(sa.repositories[0]!.headSha).not.toBe(sb.repositories[0]!.headSha);
    expect(git(source, ["status", "--porcelain"])).toBe(before);
    expect(readFileSync(join(source, "README.md"), "utf8")).toBe(
      "unstaged user work",
    );
    git(source, [
      "-c",
      "user.name=Demo",
      "-c",
      "user.email=demo@local",
      "commit",
      "-m",
      "Move source branch",
    ]);
    expect(a.config.pins[0]!.headSha).not.toBe(
      git(source, ["rev-parse", "HEAD"]),
    );
    expect(sa.repositories[0]!.baselineSha).toBe(a.config.pins[0]!.baselineSha);
    const exported = g.exportReview(a, sa);
    expect(existsSync(join(exported, "monorepo", "new.ts"))).toBe(true);
    expect(() => g.cleanup(a)).toThrow("archived");
    // Untracked sensitive files never get deleted by cleanup.
    expect(() => g.cleanup({ ...a, state: "failed", archived: true })).toThrow(
      "protected",
    );
    expect(existsSync(wb[0]!.path)).toBe(true);
  } finally {
    s.close();
  }
});
