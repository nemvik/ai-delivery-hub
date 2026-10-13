"use client";
import { TaskForm } from "../components/task-form";
import { ArtifactReview } from "../components/artifact-review";
import {
  SettingsPanel,
  type ProviderView,
  type DestinationView,
} from "../components/settings";
import { useCallback, useEffect, useState } from "react";
import type {
  Project,
  Task,
  Run,
  Snapshot,
  Artifact,
  ScenarioResult,
  ReviewRound,
  QaFinding,
  Settings,
} from "../../../packages/contracts/src/index";
type State = {
  projects: Project[];
  tasks: Task[];
  runs: Run[];
  settings: Settings;
  worker: { heartbeat: number } | null;
  providers: ProviderView[];
  destinations: DestinationView[];
  jobs: { id: string; type: string; state: string }[];
  notices: { type: string; message: string }[];
  disk: { bytes: number; retention: { runId: string; bytes: number }[] };
};
type Detail = {
  run: Run;
  snapshot: Snapshot | null;
  artifacts: Artifact[];
  results: ScenarioResult[];
  reviews: ReviewRound[];
  qaFindings: QaFinding[];
  processes: { id: string; pid: number; stepId: string; state: string }[];
  steps: {
    id: string;
    type: string;
    role?: string;
    selection?: { model: string };
    result?: { actualModels: string[] | null };
  }[];
  decisions: {
    id: string;
    findingLocalId: string;
    decision: string;
    author: string;
    reason: string;
    snapshotId: string;
  }[];
  gates: {
    repoChecks: string;
    review: string;
    integrationQa: string;
    nativeQa: string;
    evidenceIntegrity: string;
    humanApproval: string;
  } | null;
  events: { seq: number; type: string; message: string; createdAt: string }[];
};
const empty: State = {
  projects: [],
  tasks: [],
  runs: [],
  settings: {} as Settings,
  worker: null,
  providers: [],
  destinations: [],
  jobs: [],
  notices: [],
  disk: { bytes: 0, retention: [] },
};
const label = (s: string) => s.replaceAll("_", " ");
function Badge({ value }: { value: string }) {
  return <span className={`badge ${value}`}>{label(value)}</span>;
}
export default function Home() {
  const [state, setState] = useState(empty),
    [csrf, setCsrf] = useState(""),
    [view, setView] = useState("Runs"),
    [selected, setSelected] = useState<string | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [tab, setTab] = useState("Overview"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [form, setForm] = useState(false),
    [taskSeed, setTaskSeed] = useState<Partial<Task> | undefined>(),
    [busy, setBusy] = useState(false),
    [dark, setDark] = useState(false);
  const [evidenceFilter, setEvidenceFilter] = useState("");
  const load = useCallback(async () => {
    const res = await fetch("/api/v1/state");
    if (res.ok) setState(await res.json());
    if (selected) {
      const d = await fetch("/api/v1/runs/" + selected);
      if (d.ok) setDetail(await d.json());
    }
  }, [selected]);
  useEffect(() => {
    void fetch("/api/v1/session")
      .then((r) => r.json())
      .then((s: { csrf: string }) => {
        setCsrf(s.csrf);
        void load();
      });
  }, [load]);
  useEffect(() => {
    const timer = setInterval(() => void load(), 1500);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (!selected) return;
    const source = new EventSource(`/api/v1/runs/${selected}/events`);
    source.onmessage = () => void load();
    return () => source.close();
  }, [selected, load]);
  async function mutate(path: string, data: unknown, key?: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-csrf": csrf,
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await load();
      return result;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function start(task: Task) {
    const key = crypto.randomUUID();
    const run = (await mutate(
      `change-sets/${task.id}/runs`,
      {},
      key,
    )) as Run | null;
    if (run) {
      setSelected(run.id);
      setView("Runs");
      setTab("Overview");
    }
  }
  const currentProject = detail
    ? state.projects.find((p) => p.id === detail.run.projectId)
    : null;
  const workerReady =
    state.worker && Date.now() - state.worker.heartbeat < 10000;
  return (
    <div className={dark ? "app dark" : "app"}>
      <aside>
        <a className="brand" href="/" aria-label="Delivery Hub home">
          <span className="mark">d/</span> delivery<span>hub</span>
        </a>
        <div className="workspace">
          <span className="tiny">WORKSPACE</span>
          <strong>Local delivery</strong>
          <small>One operator. Verifiable work.</small>
        </div>
        <nav aria-label="Main navigation">
          {["Projects", "Tasks", "Runs", "Settings"].map((item, i) => (
            <button
              key={item}
              aria-label={item}
              className={view === item ? "nav active" : "nav"}
              onClick={() => {
                setView(item);
                setSelected(null);
                setDetail(null);
              }}
            >
              <span className="nav-icon">{["◫", "☷", "↗", "⚙"][i]}</span>
              {item}
              <span className="nav-count">
                {item === "Runs"
                  ? state.runs.length
                  : item === "Tasks"
                    ? state.tasks.length
                    : ""}
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="tiny">LOCAL BY DESIGN</span>
          <p>Source → review → proof.</p>
          <button className="text-button" onClick={() => setDark(!dark)}>
            {dark ? "☀ Light appearance" : "◐ Dark appearance"}
          </button>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <span className={`dot ${workerReady ? "online" : ""}`} />
            {workerReady ? "Worker online" : "Worker offline"}
            <span className="header-divider" />{" "}
            {state.runs.filter((r) => r.state === "running").length} active /{" "}
            {state.settings.maxActiveRuns || 2} slots
          </div>
          <button
            className="primary"
            onClick={() => {
              setTaskSeed(undefined);
              setForm(true);
            }}
            disabled={!state.projects.length}
          >
            ＋ New task
          </button>
        </header>
        <div className="content">
          {error && (
            <div role="alert" className="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="notice">
              {notice}
              <button onClick={() => setNotice("")} aria-label="Dismiss notice">
                ×
              </button>
            </div>
          )}
          {selected && detail ? (
            <>
              <button
                className="text-button"
                onClick={() => {
                  setSelected(null);
                  setDetail(null);
                }}
              >
                ← All runs
              </button>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {currentProject?.demo ? "DEMO / SYNTHETIC DATA" : "RUN"} ·{" "}
                    {detail.run.id.slice(0, 8)}
                  </div>
                  <h1>{detail.run.config.task.title}</h1>
                  <p>Every finding and test belongs to this exact assembly.</p>
                </div>
                <Badge value={detail.run.state} />
              </div>
              <div className="toolbar">
                <span>{label(detail.run.config.task.mode)}</span>
                <span>
                  {detail.snapshot?.id.slice(0, 12) || "Snapshot pending"}
                </span>
                {["running", "queued"].includes(detail.run.state) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void mutate(`runs/${selected}/actions`, {
                        action: "pause",
                      })
                    }
                  >
                    Pause run
                  </button>
                )}
                {["running", "queued"].includes(detail.run.state) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void mutate(`runs/${selected}/actions`, {
                        action: "cancel",
                      })
                    }
                  >
                    Cancel run
                  </button>
                )}
              </div>
              <div className="tabs" role="tablist">
                {[
                  "Overview",
                  "Changes",
                  "Review",
                  "Tests",
                  "Evidence",
                  "Logs",
                ].map((t) => (
                  <button
                    role="tab"
                    aria-selected={tab === t}
                    key={t}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {tab === "Overview" && (
                <div className="detail-grid">
                  <section className="panel">
                    <h2>Run timeline</h2>
                    <div className="timeline">
                      {detail.events.map((e) => (
                        <div key={e.seq}>
                          <span className="timeline-dot" />
                          <small>
                            {new Date(e.createdAt).toLocaleTimeString()}
                          </small>
                          <strong>{label(e.type)}</strong>
                          <p>{e.message}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="panel">
                    <h2>Scope & gates</h2>
                    <p>{detail.run.config.task.criteria}</p>
                    {detail.run.evidenceExpiredAt && (
                      <p>
                        Evidence files were removed under the retention policy
                        on{" "}
                        {new Date(
                          detail.run.evidenceExpiredAt,
                        ).toLocaleString()}
                        . Published copies and source worktrees remain.
                      </p>
                    )}
                    {detail.run.stale && (
                      <p role="alert">
                        Stale baseline: start a new run before approval.
                      </p>
                    )}
                    {detail.gates && (
                      <dl>
                        {(
                          [
                            "repoChecks",
                            "review",
                            "integrationQa",
                            "nativeQa",
                            "evidenceIntegrity",
                            "humanApproval",
                          ] as const
                        ).map((g) => (
                          <div key={g}>
                            <dt>{g.replace(/([A-Z])/g, " $1")}</dt>
                            <dd>
                              <Badge value={detail.gates![g]} />
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    <dl>
                      <dt>Repositories</dt>
                      <dd>
                        {detail.run.config.project.repositories
                          .map((r) => r.key)
                          .join(", ")}
                      </dd>
                      <dt>Reviewer</dt>
                      <dd>
                        {detail.run.config.task.mode === "qa_only"
                          ? "Not requested"
                          : detail.run.config.task.reviewer.model}
                      </dd>
                      <dt>Evidence</dt>
                      <dd>{detail.artifacts.length} registered artifacts</dd>
                      <dt>Publishing</dt>
                      <dd>{detail.run.publication}</dd>
                    </dl>
                    {detail.steps
                      .filter((s) => s.type === "provider")
                      .map((s) => (
                        <p key={s.id}>
                          <strong>{s.role}</strong> · requested{" "}
                          {s.selection?.model} · actual{" "}
                          {s.result?.actualModels?.join(", ") || "unknown"}
                        </p>
                      ))}
                    {detail.processes.some((p) => p.state !== "exited") && (
                      <details open>
                        <summary>Owned processes</summary>
                        {detail.processes
                          .filter((p) => p.state !== "exited")
                          .map((p) => (
                            <p key={p.id}>
                              {p.stepId} · PID {p.pid} · {p.state}
                            </p>
                          ))}
                      </details>
                    )}
                    {detail.run.error && (
                      <p className="error-text">{detail.run.error}</p>
                    )}
                    <div className="card-actions">
                      <button
                        disabled={busy}
                        onClick={() =>
                          void mutate(`runs/${selected}/actions`, {
                            action: "refresh-baseline",
                          })
                        }
                      >
                        Check baseline freshness
                      </button>
                      {[
                        "failed",
                        "blocked",
                        "interrupted",
                        "paused",
                        "cancelled",
                        "needs_input",
                      ].includes(detail.run.state) && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            void mutate(`runs/${selected}/actions`, {
                              action: "retry",
                            })
                          }
                        >
                          Retry as new run
                        </button>
                      )}
                      {!detail.run.archived &&
                        [
                          "verified",
                          "failed",
                          "cancelled",
                          "blocked",
                          "needs_input",
                        ].includes(detail.run.state) && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              void mutate(`runs/${selected}/actions`, {
                                action: "archive",
                              })
                            }
                          >
                            Archive run
                          </button>
                        )}
                    </div>
                    {detail.run.state === "awaiting_human_qa" && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void mutate(`runs/${selected}/actions`, {
                            action: "approve",
                            snapshotId: detail.run.snapshotId,
                            author: f.get("author"),
                            reason: f.get("reason"),
                            manualScenarioIds: f.getAll("manual"),
                          });
                        }}
                      >
                        <label>
                          Human QA author
                          <input name="author" required />
                        </label>
                        <label>
                          Verification notes / completed manual steps
                          <textarea name="reason" minLength={3} required />
                        </label>
                        {detail.run.config.project.scenarios
                          .filter((s) => s.required && s.kind === "manual")
                          .map((s) => (
                            <label className="checkbox" key={s.id}>
                              <input
                                type="checkbox"
                                name="manual"
                                value={s.id}
                                required
                              />
                              {s.title}: verified manually
                            </label>
                          ))}
                        <button className="primary" disabled={busy}>
                          Approve this snapshot
                        </button>
                      </form>
                    )}
                    {state.destinations.length > 0 &&
                      !["queued", "running"].includes(detail.run.state) && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            void mutate(`runs/${selected}/actions`, {
                              action: "publish",
                              destinationId: f.get("destinationId"),
                            });
                          }}
                        >
                          <label>
                            Approved export destination
                            <select name="destinationId">
                              {state.destinations.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button disabled={busy}>Publish evidence pack</button>
                        </form>
                      )}
                    <p className="muted">
                      Verified requires a human approval of this snapshot.
                      Optional native coverage is reported separately.
                    </p>
                  </section>
                </div>
              )}
              {tab === "Changes" && (
                <section className="panel">
                  <h2>Immutable assembly</h2>
                  {detail.snapshot?.repositories.map((r) => (
                    <details key={r.repoKey} open>
                      <summary>
                        {r.repoKey} · {r.headSha.slice(0, 12)}{" "}
                        {r.sourceDirty ? "· source has uncommitted work" : ""}
                      </summary>
                      <pre>
                        {detail.snapshot?.diffs[r.repoKey] ||
                          "No changes against baseline."}
                      </pre>
                    </details>
                  ))}
                </section>
              )}
              {tab === "Review" && (
                <section className="panel">
                  <h2>Independent review</h2>
                  {detail.decisions.map((d) => (
                    <article className="finding" key={d.id}>
                      <strong>
                        {d.findingLocalId}: {label(d.decision)}
                      </strong>
                      <p>
                        {d.author} · {d.reason}
                      </p>
                      <small>
                        Snapshot {d.snapshotId.slice(0, 8)}. Human exception
                        recorded; machine results are unchanged.
                      </small>
                    </article>
                  ))}
                  {detail.reviews.length > 0 && (
                    <button
                      className="primary"
                      onClick={() => {
                        setTaskSeed({
                          ...detail.run.config.task,
                          title: "Fix: " + detail.run.config.task.title,
                          mode: "implement_review_qa",
                          sourceSnapshotId: detail.run.snapshotId!,
                          criteria:
                            detail.run.config.task.criteria +
                            "\nAddress the recorded findings: " +
                            detail.reviews[0]!.review.findings.map(
                              (f) => f.localId + ": " + f.title,
                            ).join("; "),
                        });
                        setForm(true);
                      }}
                    >
                      Accept findings & prepare fix
                    </button>
                  )}
                  {detail.run.config.task.mode === "qa_only" ? (
                    <p>Code review was not part of this run.</p>
                  ) : !detail.reviews.length ? (
                    <p>No completed review yet.</p>
                  ) : (
                    detail.reviews.map((r) => (
                      <article key={r.id}>
                        <h3>
                          Round {r.round} <Badge value={r.review.verdict} />
                        </h3>
                        <p>{r.review.summary}</p>
                        <small>
                          Requested: {r.requestedModel} · Actual:{" "}
                          {r.actualModels?.join(", ") || "unknown"}
                        </small>
                        {!!r.appliedSkills?.length && (
                          <details>
                            <summary>
                              Applied review skills ({r.appliedSkills.length})
                            </summary>
                            {r.appliedSkills.map((skill) => (
                              <div className="repo" key={skill.id}>
                                <strong>{skill.title}</strong>
                                <p>{skill.reason} · Read-only analysis</p>
                                {skill.sources.map((source) => (
                                  <small key={source.path}>
                                    {source.path} · SHA256 {source.sha256}
                                  </small>
                                ))}
                                {!!skill.missingContextKeys.length && (
                                  <p>
                                    NOT_RUN context:{" "}
                                    {skill.missingContextKeys.join(", ")}
                                  </p>
                                )}
                              </div>
                            ))}
                          </details>
                        )}
                        {r.review.coverageGaps.map((gap, i) => (
                          <p className="finding" key={i}>
                            Coverage gap{gap.repoKey ? ` · ${gap.repoKey}` : ""}
                            : {gap.description}
                          </p>
                        ))}
                        {r.review.findings.map((f) => (
                          <div className="finding" key={f.localId}>
                            <Badge value={f.severity} />
                            <h3>{f.title}</h3>
                            <p>{f.description}</p>
                            <code>
                              {f.repoKey}/{f.path}:{f.startLine}
                            </code>
                            <p>{f.evidence}</p>
                            <details>
                              <summary>
                                Explain & suggested verification
                              </summary>
                              <p>{f.suggestedFix}</p>
                              <p>{f.suggestedVerification}</p>
                            </details>
                            <details>
                              <summary>Record a human decision</summary>
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const data = new FormData(e.currentTarget);
                                  void mutate(
                                    `runs/${selected}/finding-decisions`,
                                    {
                                      snapshotId: r.snapshotId,
                                      findingLocalId: f.localId,
                                      decision: data.get("decision"),
                                      author: data.get("author"),
                                      reason: data.get("reason"),
                                    },
                                  );
                                }}
                              >
                                <label>
                                  Decision
                                  <select name="decision">
                                    <option value="dispute">
                                      Dispute — needs input
                                    </option>
                                    <option value="false_positive">
                                      False positive exception
                                    </option>
                                    <option value="accept_risk">
                                      Accept risk exception
                                    </option>
                                  </select>
                                </label>
                                <label>
                                  Author
                                  <input name="author" required />
                                </label>
                                <label>
                                  Reason
                                  <textarea
                                    name="reason"
                                    minLength={5}
                                    required
                                  />
                                </label>
                                <button disabled={busy}>
                                  Record decision · tests unchanged
                                </button>
                              </form>
                            </details>
                          </div>
                        ))}
                      </article>
                    ))
                  )}
                </section>
              )}
              {tab === "Tests" && (
                <section className="panel">
                  <h2>Executed checks</h2>
                  {detail.qaFindings.length > 0 &&
                    !["queued", "running"].includes(detail.run.state) && (
                      <>
                        <p>
                          QA failures are recorded as findings. Prepare an
                          explicit fix for this snapshot; saving a task does not
                          start it.
                        </p>
                        <button
                          className="primary"
                          onClick={() => {
                            setTaskSeed({
                              ...detail.run.config.task,
                              title: "Fix QA: " + detail.run.config.task.title,
                              mode: "implement_review_qa",
                              sourceSnapshotId: detail.run.snapshotId!,
                              criteria:
                                detail.run.config.task.criteria +
                                "\nInvestigate and fix the recorded QA failures:\n" +
                                detail.qaFindings
                                  .map(
                                    (f) =>
                                      `${f.localId}: ${f.title}\nExpected: ${f.expected}\nObserved: ${f.observed}`,
                                  )
                                  .join("\n"),
                            });
                            setForm(true);
                          }}
                        >
                          Prepare fix from QA findings
                        </button>
                      </>
                    )}
                  {!detail.results.length && <p>Tests have not run yet.</p>}
                  {detail.results.map((r) => (
                    <article className="test-row" key={r.id}>
                      <Badge value={r.status} />
                      <div>
                        <h3>{r.scenarioId}</h3>
                        <p>{r.observed}</p>
                        <small>Expected: {r.expected}</small>
                        <small>
                          {r.runner} · {r.durationMs} ms · attempt {r.attempt} ·
                          snapshot {r.snapshotId.slice(0, 8)}
                        </small>
                      </div>
                    </article>
                  ))}
                </section>
              )}
              {tab === "Evidence" && (
                <>
                  <div className="section-title">
                    <h2>Evidence library</h2>
                    <span>No comparison baseline configured</span>
                  </div>
                  <label>
                    Filter by scenario, surface or file
                    <input
                      value={evidenceFilter}
                      onChange={(e) => setEvidenceFilter(e.target.value)}
                    />
                  </label>
                  <div className="gallery">
                    {detail.artifacts
                      .filter((a) =>
                        `${a.scenarioId} ${a.surfaceKey} ${a.relativePath}`
                          .toLowerCase()
                          .includes(evidenceFilter.toLowerCase()),
                      )
                      .map((a) => (
                        <article className="evidence" key={a.id}>
                          {a.mimeType === "image/png" ? (
                            <a
                              href={`/api/v1/artifacts/${a.id}/content`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <img
                                src={`/api/v1/artifacts/${a.id}/content`}
                                alt={`${a.surfaceKey} ${a.scenarioId} evidence`}
                              />
                            </a>
                          ) : (
                            <div className="file-icon">↧ {a.mimeType}</div>
                          )}
                          <div>
                            <span className="eyebrow">
                              {a.source} / {a.surfaceKey || "report"}
                            </span>
                            <h3>{a.relativePath}</h3>
                            <small>
                              {a.sha256.slice(0, 16)} ·{" "}
                              {Math.round(a.sizeBytes / 1024)} KB
                            </small>
                            <small>
                              {a.author} ·{" "}
                              {new Date(a.createdAt).toLocaleString()} ·
                              snapshot {a.snapshotId.slice(0, 8)}
                            </small>
                            <a
                              className="download"
                              href={`/api/v1/artifacts/${a.id}/content`}
                            >
                              Open artifact ↗
                            </a>
                            {a.sensitivity !== "synthetic" &&
                              a.snapshotId === detail.run.snapshotId &&
                              !["queued", "running"].includes(
                                detail.run.state,
                              ) && (
                                <ArtifactReview
                                  artifact={a}
                                  busy={busy}
                                  onReview={(id, value) =>
                                    mutate(`artifacts/${id}/review`, value)
                                  }
                                />
                              )}
                          </div>
                        </article>
                      ))}
                  </div>
                  {detail.run.snapshotId && (
                    <section className="panel onboarding">
                      <h2>Attach manual evidence</h2>
                      <p>
                        Manual images and mobile browser viewports do not
                        establish native or automated PASS.
                      </p>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const data = new FormData(e.currentTarget);
                          const file = data.get("image") as File;
                          const bytes = new Uint8Array(
                            await file.arrayBuffer(),
                          );
                          if (bytes.length > 5 * 1024 * 1024) {
                            setError("PNG must be under 5 MiB");
                            return;
                          }
                          let binary = "";
                          for (const b of bytes)
                            binary += String.fromCharCode(b);
                          await mutate(`runs/${selected}/manual-evidence`, {
                            snapshotId: detail.run.snapshotId,
                            author: data.get("author"),
                            scenarioId: data.get("scenario"),
                            surfaceKey: data.get("surface"),
                            label: data.get("label"),
                            base64: btoa(binary),
                          });
                        }}
                      >
                        <div className="form-columns">
                          <label>
                            Author
                            <input name="author" required />
                          </label>
                          <label>
                            Screenshot (PNG)
                            <input
                              type="file"
                              accept="image/png"
                              name="image"
                              required
                            />
                          </label>
                          <label>
                            Scenario
                            <select name="scenario">
                              {detail.run.config.project.scenarios.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.title}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Surface
                            <select name="surface">
                              {detail.run.config.project.surfaces.map((s) => (
                                <option key={s.key} value={s.key}>
                                  {s.key} · {s.kind}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <label>
                          Source label
                          <select name="label">
                            <option value="manual">Manual screenshot</option>
                            <option value="web/mobile viewport">
                              Web / mobile viewport
                            </option>
                          </select>
                        </label>
                        <button disabled={busy}>Attach evidence</button>
                      </form>
                    </section>
                  )}
                  {!detail.artifacts.length && (
                    <p className="empty-inline">
                      Evidence appears after a real runner completes.
                    </p>
                  )}
                </>
              )}
              {tab === "Logs" && (
                <section className="panel logs">
                  <h2>Redacted event stream</h2>
                  <pre>
                    {detail.events
                      .map(
                        (e) =>
                          `${e.seq} ${e.createdAt} [${e.type}] ${e.message}`,
                      )
                      .join("\n")}
                  </pre>
                </section>
              )}
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    DELIVERY CONTROL / {view.toUpperCase()}
                  </div>
                  <h1>
                    {view === "Runs"
                      ? "Confidence, with evidence."
                      : view === "Tasks"
                        ? "Work, deliberately started."
                        : view === "Projects"
                          ? "Your product assemblies."
                          : "Keep control local."}
                  </h1>
                  <p>
                    {view === "Runs"
                      ? "A clear view of changes, independent reviews and real test results."
                      : view === "Projects"
                        ? "Explicit repositories and approved commands. Your source checkout stays yours."
                        : "Every run keeps its configuration and its history."}
                  </p>
                </div>
                <span className="edition">
                  LOCAL
                  <br />
                  01 / WORKSPACE
                </span>
              </div>
              {view === "Runs" && (
                <>
                  <div className="stats">
                    {[
                      [
                        "In progress",
                        state.runs.filter((r) => r.state === "running").length,
                        "Active workers",
                      ],
                      [
                        "Ready for you",
                        state.runs.filter(
                          (r) => r.state === "awaiting_human_qa",
                        ).length,
                        "Human QA next",
                      ],
                      [
                        "Needs attention",
                        state.runs.filter((r) =>
                          [
                            "failed",
                            "blocked",
                            "needs_input",
                            "interrupted",
                          ].includes(r.state),
                        ).length,
                        "Inspect the evidence",
                      ],
                    ].map(([title, count, sub]) => (
                      <div key={title}>
                        <span>{title}</span>
                        <strong>{count}</strong>
                        <small>{sub}</small>
                      </div>
                    ))}
                  </div>
                  <div className="section-title">
                    <h2>Recent runs</h2>
                    <span>Durable history · live updates</span>
                  </div>
                  {!state.runs.length ? (
                    <div className="empty">
                      <span className="empty-symbol">↗</span>
                      <h2>Start with something verifiable.</h2>
                      <p>
                        {state.tasks.length
                          ? "Your demo task is ready. It will launch a real local web test and capture screenshots."
                          : "Create the demo fixtures with pnpm demo, or onboard your own project."}
                      </p>
                      {!state.projects.length && (
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => void mutate("demo", {})}
                        >
                          Create demo project
                        </button>
                      )}
                      {state.tasks[0] && (
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => void start(state.tasks[0]!)}
                        >
                          Start demo QA →
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="run-list">
                      {state.runs.map((r) => (
                        <button
                          className="run-row"
                          key={r.id}
                          onClick={() => {
                            setSelected(r.id);
                            setTab("Overview");
                          }}
                        >
                          <span className="run-number">{r.id.slice(0, 6)}</span>
                          <div>
                            <h3>{r.config.task.title}</h3>
                            <p>
                              {r.config.project.demo ? "DEMO · " : ""}
                              {r.config.project.repositories
                                .map((repo) => repo.key)
                                .join(" / ")}{" "}
                              · {label(r.config.task.mode)}
                            </p>
                            {r.queueReason && <small>{r.queueReason}</small>}
                          </div>
                          <Badge value={r.state} />
                          <span>↗</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              {view === "Tasks" && (
                <div className="cards">
                  {state.tasks.map((t) => (
                    <section className="panel" key={t.id}>
                      <span className="eyebrow">{label(t.mode)}</span>
                      <h2>{t.title}</h2>
                      <p>{t.criteria}</p>
                      <small>
                        {t.mode === "qa_only"
                          ? "QA only · no agents"
                          : t.reviewer.provider === "fake"
                            ? "DEMO provider"
                            : t.reviewer.model}
                      </small>
                      <div className="card-actions">
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => void start(t)}
                        >
                          Start run →
                        </button>
                      </div>
                    </section>
                  ))}
                </div>
              )}
              {view === "Projects" && (
                <>
                  <div className="cards">
                    {state.projects.map((p) => (
                      <section className="panel" key={p.id}>
                        <span className="eyebrow">
                          {p.demo ? "DEMO / SYNTHETIC" : "ONBOARDED"}
                        </span>
                        <h2>{p.name}</h2>
                        {p.repositories.map((r) => (
                          <div className="repo" key={r.key}>
                            <strong>{r.key}</strong>
                            <code>{r.sourcePath}</code>
                            <small>Baseline: {r.baselineRef}</small>
                            {!!r.issuePrefixes?.length && (
                              <small>
                                Linear: {r.issuePrefixes.join(", ")}
                              </small>
                            )}
                          </div>
                        ))}
                        {!!p.reviewSkills?.length && (
                          <details>
                            <summary>
                              Automatic review skills ({p.reviewSkills.length})
                            </summary>
                            <p>
                              Applied after Start when linked issues or changed
                              repositories match. Versions are frozen per run.
                              Read-only analysis; no external publication.
                            </p>
                            {p.reviewSkills.map((skill) => (
                              <p key={skill.id}>
                                <strong>{skill.title}</strong>
                                <br />
                                {label(skill.trigger)} ·{" "}
                                {skill.repoKeys.join(", ")}
                              </p>
                            ))}
                          </details>
                        )}
                        {!!p.onboardingNotes?.length && (
                          <details open>
                            <summary>Remaining onboarding</summary>
                            {p.onboardingNotes.map((note) => (
                              <p key={note}>{note}</p>
                            ))}
                          </details>
                        )}
                      </section>
                    ))}
                  </div>
                  <section className="panel onboarding">
                    <h2>Onboard a trusted project</h2>
                    <p>
                      Enter the exact source paths, surfaces, commands and QA
                      scenarios. Only committed revisions will be imported.
                    </p>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        try {
                          const result = await mutate(
                            "projects",
                            JSON.parse(String(f.get("config"))),
                          );
                          if (result)
                            setNotice(
                              "Project registered. Create a task to review its exact revisions.",
                            );
                        } catch (err) {
                          setError(String(err));
                        }
                      }}
                    >
                      <label>
                        Project configuration (JSON)
                        <textarea
                          name="config"
                          rows={9}
                          required
                          defaultValue={JSON.stringify(
                            {
                              name: "My product",
                              trusted: true,
                              repositories: [
                                {
                                  key: "app",
                                  sourcePath: "/explicit/path/to/repo",
                                  baselineRef: "main",
                                },
                              ],
                              surfaces: [],
                              commands: [],
                              scenarios: [],
                            },
                            null,
                            2,
                          )}
                        />
                      </label>
                      <button className="primary" disabled={busy}>
                        Validate & register
                      </button>
                    </form>
                  </section>
                </>
              )}
              {view === "Settings" && (
                <SettingsPanel
                  settings={state.settings}
                  providers={state.providers}
                  destinations={state.destinations}
                  projects={state.projects}
                  jobs={state.jobs}
                  notices={state.notices}
                  disk={state.disk}
                  busy={busy}
                  mutate={mutate}
                />
              )}
            </>
          )}
        </div>
      </main>
      {form && (
        <TaskForm
          projects={state.projects}
          defaultRoles={state.settings.defaultRoles}
          seed={taskSeed}
          busy={busy}
          onClose={() => setForm(false)}
          onSave={async (value) => {
            const task = await mutate("change-sets", value);
            if (task) {
              setForm(false);
              setView("Tasks");
              setSelected(null);
              setDetail(null);
              setNotice("Task saved. Start explicitly when ready.");
            }
          }}
        />
      )}
    </div>
  );
}
