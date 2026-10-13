"use client";
import { useState } from "react";
import type { DestinationView, Hub, RunDetail } from "../../lib/hub";
import { rememberAuthor, rememberedAuthor } from "../../lib/hub";
import {
  ACTIVE,
  GATE_LABELS,
  gateStatus,
  type GateKey,
} from "../../lib/labels";
import { Disclosure, Field, StatusPill } from "../ui";

const GATES: GateKey[] = [
  "repoChecks",
  "review",
  "integrationQa",
  "nativeQa",
  "evidenceIntegrity",
  "humanApproval",
];

function ApproveForm({
  detail,
  hub,
  act,
}: {
  detail: RunDetail;
  hub: Hub;
  act: (a: string, x?: object) => Promise<unknown>;
}) {
  const [author, setAuthor] = useState(rememberedAuthor);
  const [reason, setReason] = useState("");
  const manual = detail.run.config.project.scenarios.filter(
    (s) => s.required && s.kind === "manual",
  );
  const [checked, setChecked] = useState<string[]>([]);
  return (
    <form
      className="card"
      style={{ borderColor: "var(--accent)" }}
      onSubmit={(e) => {
        e.preventDefault();
        rememberAuthor(author);
        void act("approve", {
          snapshotId: detail.run.snapshotId,
          author,
          reason,
          manualScenarioIds: checked,
        });
      }}
    >
      <div>
        <h2>Approve this version</h2>
        <p className="muted">
          Approval applies only to this exact set of commits. Any new change
          needs a new run and a new approval.
        </p>
      </div>
      <div className="form-grid">
        <Field label="Your name" id="approve-author">
          {(id) => (
            <input
              id={id}
              className="input"
              required
              maxLength={100}
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="What did you check?"
          className="span"
          help="For example which screens and data you looked at."
        >
          {(id) => (
            <textarea
              id={id}
              className="textarea"
              required
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
      </div>
      {manual.map((s) => (
        <label className="check" key={s.id}>
          <input
            type="checkbox"
            required
            checked={checked.includes(s.id)}
            onChange={(e) =>
              setChecked(
                e.target.checked
                  ? [...checked, s.id]
                  : checked.filter((x) => x !== s.id),
              )
            }
          />
          <span>
            I checked “{s.title}” by hand.{" "}
            <span className="muted">Expected: {s.expected}</span>
          </span>
        </label>
      ))}
      <div className="row">
        <button className="btn btn-primary" disabled={hub.busy}>
          Approve this version
        </button>
      </div>
    </form>
  );
}

export function OverviewTab({
  detail,
  hub,
  destinations,
  onOpenSettings,
  onShowLogs,
  act,
  canArchive,
}: {
  detail: RunDetail;
  hub: Hub;
  destinations: DestinationView[];
  onOpenSettings: () => void;
  onShowLogs: () => void;
  act: (a: string, x?: object) => Promise<unknown>;
  canArchive: boolean;
}) {
  const { run } = detail;
  const active = ACTIVE.includes(run.state);
  const [destination, setDestination] = useState("");
  const providerSteps = detail.steps.filter((s) => s.type === "provider");
  const tidy = (message: string) =>
    hub.state.home ? message.split(hub.state.home).join("~") : message;
  const live = detail.processes.filter((p) => p.state !== "exited");
  return (
    <div className="two-col" style={{ marginTop: 18 }}>
      <div className="stack-lg">
        {run.state === "awaiting_human_qa" && (
          <ApproveForm detail={detail} hub={hub} act={act} />
        )}
        <div className="card">
          <h2>Checks</h2>
          {detail.gates ? (
            <ul className="checklist">
              {GATES.map((g) => {
                const raw =
                  g === "repoChecks" &&
                  !run.config.project.commands.some((c) => c.kind !== "start")
                    ? "none_configured"
                    : detail.gates![g];
                const value =
                  g === "humanApproval"
                    ? run.state === "verified"
                      ? "passed"
                      : run.state === "awaiting_human_qa"
                        ? "required"
                        : "not_reached"
                    : active && (raw === "failed" || g === "evidenceIntegrity")
                      ? "pending"
                      : raw;
                return (
                  <li key={g}>
                    <span>
                      <b>{GATE_LABELS[g].title}</b>
                      <small>{GATE_LABELS[g].help}</small>
                    </span>
                    <StatusPill status={gateStatus(value)} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">
              Checks appear once the exact versions are pinned.
            </p>
          )}
          {run.stale && (
            <p role="alert" style={{ color: "var(--warn)", fontWeight: 600 }}>
              The baseline has moved since this run started. Start a new run
              before approving.
            </p>
          )}
        </div>
        <div className="card">
          <h2>What must be true</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{run.config.task.criteria}</p>
          {run.config.task.issueKeys.length > 0 && (
            <p className="muted">
              Linked issues: {run.config.task.issueKeys.join(", ")}
            </p>
          )}
        </div>
        {!active && destinations.length > 0 && (
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              void act("publish", {
                destinationId: destination || destinations[0]!.id,
              });
            }}
          >
            <div>
              <h2>Share the evidence pack</h2>
              <p className="muted">
                Copies the report, screenshots and a checksum manifest to a
                report folder.{" "}
                {run.publication === "published"
                  ? "Already published; publishing again adds a new revision."
                  : run.publication === "publish_failed"
                    ? "The last attempt failed."
                    : "Nothing has been published yet."}
              </p>
            </div>
            <div className="input-row">
              <Field label="Report folder">
                {(id) => (
                  <select
                    id={id}
                    className="select"
                    value={destination || destinations[0]!.id}
                    onChange={(e) => setDestination(e.target.value)}
                  >
                    {destinations.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <button
                className="btn"
                style={{ alignSelf: "end" }}
                disabled={hub.busy}
              >
                Publish evidence pack
              </button>
            </div>
          </form>
        )}
        {!active && !destinations.length && (
          <p className="muted">
            To share this run’s evidence,{" "}
            <button className="link-btn" onClick={onOpenSettings}>
              add a report folder
            </button>{" "}
            in App settings.
          </p>
        )}
      </div>
      <div className="stack-lg">
        <div className="card">
          <div className="spread">
            <h2>Recent activity</h2>
            <button className="link-btn" onClick={onShowLogs}>
              Full log
            </button>
          </div>
          <ol className="timeline">
            {detail.events
              .slice(-8)
              .reverse()
              .map((e) => (
                <li key={e.seq}>
                  <time>
                    {new Date(e.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  <p>{tidy(e.message)}</p>
                </li>
              ))}
          </ol>
        </div>
        {run.evidenceExpiredAt && (
          <p className="muted">
            Evidence files were removed by the retention policy on{" "}
            {new Date(run.evidenceExpiredAt).toLocaleString()}. Published copies
            and source worktrees remain.
          </p>
        )}
        <Disclosure
          summary="Technical details"
          hint="versions, models, processes"
        >
          <dl className="kv">
            <dt>Run</dt>
            <dd className="mono">{run.id}</dd>
            <dt>Snapshot</dt>
            <dd className="mono">
              {detail.snapshot ? detail.snapshot.id : "not created yet"}
            </dd>
            {detail.snapshot && (
              <>
                <dt>Plan hash</dt>
                <dd className="mono">
                  {detail.snapshot.planHash.slice(0, 16)}…
                </dd>
              </>
            )}
            <dt>Publishing</dt>
            <dd>{run.publication.replaceAll("_", " ")}</dd>
          </dl>
          <div className="tech">
            {run.config.pins.map((p) => (
              <span key={p.repoKey}>
                {p.repoKey}: {p.baselineSha.slice(0, 10)} →{" "}
                {p.headSha.slice(0, 10)}
                {p.sourceDirty
                  ? " (your checkout had uncommitted work, not included)"
                  : ""}
              </span>
            ))}
            {providerSteps.map((s) => (
              <span key={s.id}>
                {s.role}: requested {s.selection?.model ?? "unknown"} · actual{" "}
                {s.result?.actualModels?.join(", ") || "unknown"}
              </span>
            ))}
            {live.map((p) => (
              <span key={p.id}>
                process {p.pid} ({p.stepId}) · {p.state}
              </span>
            ))}
          </div>
          <div className="row">
            <button
              className="btn btn-sm"
              disabled={hub.busy}
              onClick={() => void act("refresh-baseline")}
            >
              Check baseline freshness
            </button>
            {canArchive && (
              <button
                className="btn btn-sm btn-ghost"
                disabled={hub.busy}
                onClick={() => void act("archive")}
              >
                Archive run
              </button>
            )}
          </div>
        </Disclosure>
      </div>
    </div>
  );
}
