"use client";
import type { Task } from "../../../../packages/contracts/src/index";
import type { RunDetail } from "../../lib/hub";
import { ACTIVE, qaStatus } from "../../lib/labels";
import { Disclosure, Icon, StatusPill } from "../ui";

function firstSentence(text: string) {
  const line = text.split("\n")[0]!;
  const cut = line.slice(0, 200);
  const stop = cut.search(/[.:]\s/);
  return (
    (stop > 40 ? cut.slice(0, stop + 1) : cut) +
    (line.length > cut.length || stop > 40 ? " …" : "")
  );
}

export function TestsTab({
  detail,
  home,
  onPrepareFix,
}: {
  detail: RunDetail;
  home: string | null;
  onPrepareFix: (seed: Partial<Task>) => void;
}) {
  const { run } = detail;
  const task = run.config.task;
  const scenarios = new Map(run.config.project.scenarios.map((s) => [s.id, s]));
  const commands = new Map(run.config.project.commands.map((c) => [c.id, c]));
  const title = (id: string) => {
    if (id.startsWith("check:")) {
      const c = commands.get(id.slice(6));
      return c
        ? `Check: ${c.executable} ${c.args.join(" ")}`
        : `Check: ${id.slice(6)}`;
    }
    return scenarios.get(id)?.title ?? id;
  };
  const order = (s: string) =>
    ["failed", "blocked", "flaky", "not_run", "skipped", "passed"].indexOf(s);
  const sorted = [...detail.results].sort(
    (a, b) => order(a.status) - order(b.status),
  );
  // Gates judge only the version the run ended on; older versions are history.
  const results = sorted.filter((r) => r.snapshotId === run.snapshotId);
  const earlier = sorted.filter((r) => r.snapshotId !== run.snapshotId);
  const renderRow = (r: (typeof sorted)[number]) => (
    <article className="test-row" key={r.id} data-scenario={r.scenarioId}>
      <div>
        <StatusPill status={qaStatus(r.status)} />
      </div>
      <div className="stack" style={{ gap: 4 }}>
        <h3>{title(r.scenarioId)}</h3>
        {r.observed.length > 220 ? (
          <>
            <p>{firstSentence(r.observed)}</p>
            <Disclosure summary="Show details" plain>
              <pre className="log">
                {home ? r.observed.split(home).join("~") : r.observed}
              </pre>
            </Disclosure>
          </>
        ) : (
          <p>{r.observed}</p>
        )}
        <small className="muted">Expected: {r.expected}</small>
        {r.assertions.length > 0 && (
          <ul className="assertions">
            {r.assertions.map((a, i) => (
              <li
                key={i}
                style={{ color: a.passed ? "var(--ok)" : "var(--bad)" }}
              >
                <Icon name={a.passed ? "check" : "x"} />
                <span style={{ color: "var(--ink)" }}>{a.description}</span>
              </li>
            ))}
          </ul>
        )}
        <small className="faint">
          {r.source === "manual" ? "Manual" : r.runner} ·{" "}
          {(r.durationMs / 1000).toFixed(1)} s
          {r.attempt > 1 ? ` · attempt ${r.attempt}` : ""}
          {r.scenarioId.startsWith("check:")
            ? ""
            : ` · scenario ${r.scenarioId}`}
        </small>
      </div>
    </article>
  );
  return (
    <div className="stack-lg" style={{ marginTop: 18 }}>
      {detail.qaFindings.length > 0 &&
        !ACTIVE.includes(run.state) &&
        run.snapshotId && (
          <div className="spread card" style={{ borderColor: "var(--bad)" }}>
            <div>
              <h2>
                {detail.qaFindings.length} required{" "}
                {detail.qaFindings.length === 1 ? "scenario" : "scenarios"}{" "}
                failed
              </h2>
              <p className="muted">
                Prepare a fix run from this exact version with the failures
                attached. Saving doesn’t start it.
              </p>
            </div>
            <button
              className="btn btn-primary"
              onClick={() =>
                onPrepareFix({
                  ...task,
                  title: "Fix QA: " + task.title,
                  mode: "implement_review_qa",
                  sourceSnapshotId: run.snapshotId!,
                  criteria:
                    task.criteria +
                    "\nInvestigate and fix the recorded QA failures:\n" +
                    detail.qaFindings
                      .map(
                        (f) =>
                          `${f.localId}: ${f.title}\nExpected: ${f.expected}\nObserved: ${f.observed}`,
                      )
                      .join("\n"),
                })
              }
            >
              Prepare fix from QA findings
            </button>
          </div>
        )}
      {!results.length ? (
        <p className="empty-inline">
          {ACTIVE.includes(run.state)
            ? "Tests haven’t run yet."
            : "No test results were recorded for this run."}
        </p>
      ) : (
        <div className="list">{results.map(renderRow)}</div>
      )}
      {earlier.length > 0 && (
        <Disclosure
          summary={`Earlier versions in this run (${earlier.length} results)`}
          hint="not used for the checks above"
        >
          <div className="list">{earlier.map(renderRow)}</div>
        </Disclosure>
      )}
    </div>
  );
}
