"use client";
import { useState } from "react";
import type { Finding, Task } from "../../../../packages/contracts/src/index";
import type { Hub, RunDetail } from "../../lib/hub";
import { rememberAuthor, rememberedAuthor } from "../../lib/hub";
import {
  ACTIVE,
  DECISIONS,
  severityStatus,
  verdictStatus,
} from "../../lib/labels";
import { Disclosure, Field, Pill, StatusPill } from "../ui";

function DecisionForm({
  finding,
  snapshotId,
  runId,
  hub,
}: {
  finding: Finding;
  snapshotId: string;
  runId: string;
  hub: Hub;
}) {
  const [decision, setDecision] = useState("dispute");
  const [author, setAuthor] = useState(rememberedAuthor);
  const [reason, setReason] = useState("");
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        rememberAuthor(author);
        void hub.mutate(`runs/${runId}/finding-decisions`, {
          snapshotId,
          findingLocalId: finding.localId,
          decision,
          author,
          reason,
        });
      }}
    >
      <div className="form-grid">
        <Field label="Decision">
          {(id) => (
            <select
              id={id}
              className="select"
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
            >
              <option value="dispute">Dispute: needs a closer look</option>
              <option value="false_positive">
                False positive: the finding is wrong
              </option>
              <option value="accept_risk">Accept the risk knowingly</option>
            </select>
          )}
        </Field>
        <Field label="Your name">
          {(id) => (
            <input
              id={id}
              className="input"
              required
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          )}
        </Field>
        <Field label="Reason" className="span">
          {(id) => (
            <textarea
              id={id}
              className="textarea"
              required
              minLength={5}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
      </div>
      <div className="row">
        <button className="btn" disabled={hub.busy}>
          Record decision
        </button>
        <span className="field-help">
          Recorded as an exception. Test results stay as they are.
        </span>
      </div>
    </form>
  );
}

export function ReviewTab({
  detail,
  hub,
  onPrepareFix,
}: {
  detail: RunDetail;
  hub: Hub;
  onPrepareFix: (seed: Partial<Task>) => void;
}) {
  const { run } = detail;
  const task = run.config.task;
  if (task.mode === "qa_only")
    return (
      <p className="empty-inline">
        Code review is not part of this run. It only re-ran the tests.
      </p>
    );
  if (!detail.reviews.length)
    return (
      <p className="empty-inline">
        {ACTIVE.includes(run.state)
          ? "The review hasn’t finished yet."
          : "This run has no completed review."}
      </p>
    );
  const latest = detail.reviews[0]!;
  const blocking = latest.review.findings.filter(
    (f) => f.severity === "P0" || f.severity === "P1",
  );
  return (
    <div className="stack-lg" style={{ marginTop: 18 }}>
      {latest.review.findings.length > 0 &&
        !ACTIVE.includes(run.state) &&
        run.snapshotId && (
          <div className="spread card">
            <div>
              <h2>
                {blocking.length
                  ? `${blocking.length} blocking ${blocking.length === 1 ? "finding" : "findings"}`
                  : `${latest.review.findings.length} ${latest.review.findings.length === 1 ? "finding" : "findings"}`}
              </h2>
              <p className="muted">
                Prepare a fix run that starts from this exact version. You can
                edit it before starting.
              </p>
            </div>
            <button
              className="btn btn-primary"
              onClick={() =>
                onPrepareFix({
                  ...task,
                  title: "Fix: " + task.title,
                  mode: "implement_review_qa",
                  sourceSnapshotId: run.snapshotId!,
                  criteria:
                    task.criteria +
                    "\nAddress the recorded findings: " +
                    latest.review.findings
                      .map((f) => f.localId + ": " + f.title)
                      .join("; "),
                })
              }
            >
              Accept findings and prepare a fix
            </button>
          </div>
        )}
      {detail.decisions.length > 0 && (
        <div className="card">
          <h2>Your decisions</h2>
          {detail.decisions.map((d) => (
            <div key={d.id}>
              <b>
                {d.findingLocalId}: {DECISIONS[d.decision] ?? d.decision}
              </b>
              <p className="muted">
                {d.author}: {d.reason}
              </p>
            </div>
          ))}
          <p className="field-help">
            Exceptions are recorded for this exact version. Machine results are
            unchanged.
          </p>
        </div>
      )}
      {detail.reviews.map((r) => (
        <section key={r.id} className="stack">
          <div className="spread">
            <div className="row">
              <h2 style={{ fontSize: "1.1rem" }}>Review round {r.round}</h2>
              <StatusPill status={verdictStatus(r.review.verdict)} />
            </div>
            <span className="faint" style={{ fontSize: "0.85rem" }}>
              Requested {r.requestedModel} · reported{" "}
              {r.actualModels?.join(", ") || "unknown"}
            </span>
          </div>
          <p>{r.review.summary}</p>
          {!!r.appliedSkills?.length && (
            <Disclosure
              summary={`Applied review skills (${r.appliedSkills.length})`}
              plain
            >
              {r.appliedSkills.map((skill) => (
                <div key={skill.id} className="stack" style={{ gap: 4 }}>
                  <b>{skill.title}</b>
                  <span className="muted">
                    {skill.reason} · Read-only analysis
                  </span>
                  {skill.sources.map((source) => (
                    <small key={source.path} className="mono faint">
                      {source.path} · SHA256 {source.sha256}
                    </small>
                  ))}
                  {!!skill.missingContextKeys.length && (
                    <span style={{ color: "var(--warn)" }}>
                      Missing context (not run):{" "}
                      {skill.missingContextKeys.join(", ")}
                    </span>
                  )}
                </div>
              ))}
            </Disclosure>
          )}
          {r.review.coverageGaps.map((gap, i) => (
            <div className="finding" data-tone="warn" key={i}>
              <div className="row">
                <Pill tone="warn" icon="alert">
                  Coverage gap
                </Pill>
                {gap.repoKey && <span className="muted">{gap.repoKey}</span>}
              </div>
              <p>{gap.description}</p>
            </div>
          ))}
          {!r.review.findings.length && !r.review.coverageGaps.length && (
            <p className="muted">No findings in this round.</p>
          )}
          {r.review.findings.map((f) => {
            const sev = severityStatus(f.severity);
            return (
              <article className="finding" data-tone={sev.tone} key={f.localId}>
                <div className="row">
                  <StatusPill status={sev} />
                  <span className="faint">{sev.meaning}</span>
                  <span className="faint">· {f.category}</span>
                </div>
                <h3>{f.title}</h3>
                <p>{f.description}</p>
                <code style={{ alignSelf: "flex-start" }}>
                  {f.repoKey}/{f.path ?? ""}
                  {f.startLine ? `:${f.startLine}` : ""}
                </code>
                {f.evidence && (
                  <p className="muted">
                    <b>Evidence:</b> {f.evidence}
                  </p>
                )}
                <Disclosure summary="Suggested fix and how to verify it" plain>
                  <p>{f.suggestedFix}</p>
                  <p className="muted">{f.suggestedVerification}</p>
                </Disclosure>
                {r.snapshotId === run.snapshotId && (
                  <Disclosure summary="Record a decision" plain>
                    <DecisionForm
                      finding={f}
                      snapshotId={r.snapshotId}
                      runId={run.id}
                      hub={hub}
                    />
                  </Disclosure>
                )}
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}
