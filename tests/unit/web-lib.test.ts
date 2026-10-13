import { describe, it, expect } from "vitest";
import {
  parseCommandLine,
  formatCommandLine,
} from "../../apps/web/lib/command-line";
import { parseNav, serializeNav, resolveNav } from "../../apps/web/lib/nav";
import { runStatus, qaStatus, gateStatus } from "../../apps/web/lib/labels";
import { progressSteps, nextStep } from "../../apps/web/lib/run-progress";
import type { RunDetail } from "../../apps/web/lib/hub";
import type { Project, Run } from "../../packages/contracts/src/index";

describe("command line", () => {
  it("splits on whitespace and keeps quoted spaces", () => {
    expect(
      parseCommandLine(`  node  scripts/qa.mjs --name "two words" 'x y' `),
    ).toEqual({
      executable: "node",
      args: ["scripts/qa.mjs", "--name", "two words", "x y"],
    });
    expect(parseCommandLine('echo ""')).toEqual({
      executable: "echo",
      args: [""],
    });
  });
  it("reports unclosed quotes and empty input", () => {
    expect(() => parseCommandLine('node "oops')).toThrow("Unclosed quote");
    expect(() => parseCommandLine("   ")).toThrow("Enter a command");
  });
  it("round-trips arguments with spaces, quotes and placeholders", () => {
    const parsed = {
      executable: "node",
      args: ["a b", "", "{{ports.backend}}", `it's`, `say "hi"`],
    };
    expect(
      parseCommandLine(formatCommandLine(parsed.executable, parsed.args)),
    ).toEqual(parsed);
  });
});

describe("navigation state", () => {
  const project = (id: string, archived = false) =>
    ({ id, archived }) as unknown as Project;
  const run = (id: string) => ({ id }) as unknown as Run;
  it("parses, validates and serializes", () => {
    const n = parseNav("?project=a&view=runs&run=r1&tab=Review");
    expect(n).toMatchObject({
      project: "a",
      view: "runs",
      run: "r1",
      tab: "Review",
    });
    expect(parseNav(serializeNav(n))).toEqual(n);
    expect(parseNav("?view=bogus&tab=nope")).toMatchObject({
      view: "overview",
      tab: "Overview",
    });
  });
  it("falls back from unknown or archived projects and unknown runs", () => {
    const projects = [project("a", true), project("b")];
    expect(
      resolveNav(parseNav("?project=zzz"), projects, [], null).project,
    ).toBe("b");
    expect(resolveNav(parseNav("?project=a"), projects, [], null).project).toBe(
      "a",
    );
    expect(resolveNav(parseNav(""), projects, [], "a").project).toBe("b");
    expect(resolveNav(parseNav(""), projects, [], "b").project).toBe("b");
    expect(
      resolveNav(parseNav("?project=all"), projects, [], null).project,
    ).toBe("all");
    expect(resolveNav(parseNav(""), [], [], "b").project).toBeNull();
    expect(
      resolveNav(parseNav("?run=missing&view=runs"), projects, [run("r")], null)
        .run,
    ).toBeNull();
    expect(
      resolveNav(parseNav("?run=r&view=runs"), projects, [run("r")], null).run,
    ).toBe("r");
  });
});

describe("labels", () => {
  it("never presents incomplete coverage as success", () => {
    for (const s of ["not_run", "blocked", "flaky", "skipped"] as const)
      expect(qaStatus(s).tone).not.toBe("ok");
    for (const g of ["not_configured", "failed", "required"])
      expect(gateStatus(g).tone).not.toBe("ok");
    expect(runStatus("awaiting_human_qa")).toMatchObject({
      label: "Ready for your QA",
      whoseTurn: "you",
    });
    expect(runStatus("failed").tone).toBe("bad");
  });
});

function detail(
  state: Run["state"],
  mode: "review_qa" | "qa_only" | "implement_review_qa",
  extra: Partial<RunDetail> = {},
): RunDetail {
  return {
    run: {
      id: "r",
      state,
      snapshotId: extra.snapshot ? "s" : null,
      queueReason: null,
      error: null,
      stale: false,
      config: {
        task: { mode },
        project: { scenarios: [], repositories: [] },
        pins: [{ repoKey: "app" }],
      },
    } as unknown as Run,
    snapshot: null,
    artifacts: [],
    results: [],
    reviews: [],
    qaFindings: [],
    processes: [],
    steps: [],
    decisions: [],
    approvals: [],
    gates: null,
    events: [],
    ...extra,
  };
}
const passedGates = {
  repoChecks: "passed",
  review: "passed",
  integrationQa: "passed",
  nativeQa: "not_required",
  evidenceIntegrity: "passed",
  humanApproval: "required",
};

describe("run progress", () => {
  it("shows review as skipped in qa_only and marks your QA as current", () => {
    const steps = progressSteps(
      detail("awaiting_human_qa", "qa_only", {
        snapshot: {} as RunDetail["snapshot"],
        gates: { ...passedGates, review: "not_required" },
      }),
    );
    expect(steps.map((s) => s.key)).toEqual([
      "prepare",
      "review",
      "tests",
      "qa",
      "verified",
    ]);
    expect(steps.find((s) => s.key === "review")!.status).toBe("skipped");
    expect(steps.find((s) => s.key === "qa")!.status).toBe("current");
  });
  it("includes implementation only in implement mode and stops at the failing step", () => {
    const steps = progressSteps(
      detail("failed", "implement_review_qa", {
        snapshot: {} as RunDetail["snapshot"],
        gates: { ...passedGates, integrationQa: "failed" },
      }),
    );
    expect(steps.map((s) => s.key)).toContain("implement");
    expect(steps.find((s) => s.key === "tests")!.status).toBe("failed");
    expect(steps.find((s) => s.key === "qa")!.status).toBe("todo");
  });
  it("suggests a concrete next step", () => {
    expect(
      nextStep(
        detail("awaiting_human_qa", "review_qa", {
          snapshot: {} as RunDetail["snapshot"],
          gates: passedGates,
        }),
      ).title,
    ).toMatch(/approve/i);
    expect(
      nextStep(
        detail("failed", "qa_only", {
          qaFindings: [{} as RunDetail["qaFindings"][number]],
        }),
      ).tab,
    ).toBe("Tests");
    expect(nextStep(detail("running", "review_qa")).title).toMatch(
      /nothing to do/i,
    );
    const review = (findings: { severity: string }[], verdict: string) =>
      [
        { round: 1, review: { verdict, findings, coverageGaps: [] } },
      ] as unknown as RunDetail["reviews"];
    expect(
      nextStep(
        detail("needs_input", "review_qa", {
          reviews: review([], "incomplete"),
        }),
      ).title,
    ).toBe("The review is incomplete");
    expect(
      nextStep(
        detail("needs_input", "review_qa", {
          reviews: review([{ severity: "P1" }], "changes_requested"),
        }),
      ).title,
    ).toBe("Decide on the review findings");
  });
});
