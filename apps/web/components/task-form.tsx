"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Project,
  RepositoryInspection,
  Role,
  Run,
  Settings,
  Task,
} from "../../../packages/contracts/src/index";
import type { Hub, HubState } from "../lib/hub";
import { rememberAuthor, rememberedAuthor } from "../lib/hub";
import { MODE_LABELS, MODE_ORDER, PROVIDER_LABELS } from "../lib/labels";
import {
  DEFAULT_ROLE,
  RolePicker,
  modelStatus,
  roleSummary,
} from "./role-picker";
import {
  Banner,
  ChipInput,
  DemoTag,
  Disclosure,
  Field,
  Icon,
  Segmented,
  Stepper,
} from "./ui";

const DEMO_SCENARIOS = [
  { value: "pass", label: "Passing fixture" },
  { value: "web-fail", label: "Real web assertion failure" },
  { value: "contract-defect", label: "Repairable cross-repo defect" },
  { value: "limit", label: "Persistent finding / review limit" },
  { value: "hang", label: "Long process / cancel" },
];
type Pin = Task["dependencyPins"][number];

function initialRole(
  name: "implementer" | "reviewer",
  project: Project | undefined,
  settings: Settings,
  seed?: Partial<Task>,
): Role {
  if (seed?.[name]) return seed[name]!;
  if (project?.defaultRoles?.[name]) return project.defaultRoles[name]!;
  if (settings.defaultRoles?.[name]) return settings.defaultRoles[name]!;
  if (project?.demo)
    return {
      provider: "fake",
      model: "demo-deterministic",
      effort: null,
      timeoutSeconds: 60,
      maxTurns: null,
    };
  return DEFAULT_ROLE[name];
}

export function TaskForm({
  projects,
  projectId: initialProjectId,
  state,
  hub,
  seed,
  onClose,
  onDone,
}: {
  projects: Project[];
  projectId: string | null;
  state: HubState;
  hub: Hub;
  seed?: Partial<Task>;
  onClose: () => void;
  onDone: (result: {
    task: Task;
    run: Run | null;
    startError?: string;
  }) => void;
}) {
  const settings = state.settings;
  const fixing = !!seed?.sourceSnapshotId;
  const [tab, setTab] = useState<"write" | "linear">("write");
  const [projectId, setProjectId] = useState(
    seed?.projectId || initialProjectId || projects[0]?.id || "",
  );
  const project = projects.find((p) => p.id === projectId);
  const [title, setTitle] = useState(seed?.title ?? "");
  const [criteria, setCriteria] = useState(seed?.criteria ?? "");
  const [issues, setIssues] = useState<string[]>(seed?.issueKeys ?? []);
  const [mode, setMode] = useState<Task["mode"]>(seed?.mode ?? "review_qa");
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [branches, setBranches] = useState<Record<string, string[]>>({});
  const [implementer, setImplementer] = useState<Role>(() =>
    initialRole("implementer", project, settings, seed),
  );
  const [reviewer, setReviewer] = useState<Role>(() =>
    initialRole("reviewer", project, settings, seed),
  );
  const [showAi, setShowAi] = useState(false);
  const [rounds, setRounds] = useState(seed?.maxReviewRounds ?? 3);
  const [minutes, setMinutes] = useState(seed?.maxRunMinutes ?? 120);
  const [pins, setPins] = useState<Pin[]>(seed?.dependencyPins ?? []);
  const [risky, setRisky] = useState(seed?.risky ?? false);
  const [approvalAuthor, setApprovalAuthor] = useState(rememberedAuthor);
  const [approvalReason, setApprovalReason] = useState("");
  const [demoScenario, setDemoScenario] = useState<string>(
    seed?.demoScenario ?? "pass",
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [linearIssue, setLinearIssue] = useState("");
  const [linearJob, setLinearJob] = useState<string | null>(null);

  useEffect(() => {
    if (!project) return;
    setRefs(
      Object.fromEntries(
        project.repositories.map((r) => [
          r.key,
          seed?.refs?.[r.key] ?? r.baselineRef,
        ]),
      ),
    );
    if (!seed) {
      setImplementer(initialRole("implementer", project, settings));
      setReviewer(initialRole("reviewer", project, settings));
    }
    if (fixing) return;
    let cancelled = false;
    for (const r of project.repositories)
      void hub
        .call<RepositoryInspection>("repositories/inspect", {
          path: r.sourcePath,
        })
        .then((res) => {
          if (!cancelled && res.ok)
            setBranches((b) => ({ ...b, [r.key]: res.data.branches }));
        });
    return () => {
      cancelled = true;
    };
    // Re-run only when the chosen project changes.
  }, [projectId]);

  const edited =
    title !== (seed?.title ?? "") ||
    criteria !== (seed?.criteria ?? "") ||
    !!linearIssue.trim();
  const requestClose = () => {
    if (edited && !window.confirm("Discard this task?")) return;
    onClose();
  };
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const inFlight = useRef(false);

  const needsImplementer = mode === "implement_review_qa";
  const needsReviewer = mode !== "qa_only";
  const commands = project?.commands.filter((c) => c.kind !== "start") ?? [];
  const required = project?.scenarios.filter((s) => s.required) ?? [];
  const warnings = useMemo(() => {
    const list: string[] = [];
    const check = (label: string, role: Role) => {
      const status = modelStatus(role, settings.models ?? []);
      if (status && status.tone !== "ok")
        list.push(
          `The ${label} model “${role.model || "not set"}” hasn’t passed a test prompt, so the run will be blocked. Verify it in App settings → AI connections.`,
        );
    };
    if (needsImplementer) check("implementer", implementer);
    if (needsReviewer) check("reviewer", reviewer);
    if (
      project &&
      !project.scenarios.some(
        (s) => s.required && s.kind !== "manual" && s.kind !== "native",
      )
    )
      list.push(
        "This project has no required automated scenario yet, so the run can’t pass QA. Add one in Project settings → Tests.",
      );
    return list;
  }, [
    needsImplementer,
    needsReviewer,
    implementer,
    reviewer,
    settings.models,
    project,
  ]);

  const submit = async (start: boolean) => {
    if (!project || inFlight.current) return;
    setError("");
    if (!title.trim() || !criteria.trim())
      return setError("Add a title and the acceptance criteria.");
    if (needsReviewer && !reviewer.model)
      return setError("Choose a reviewer model.");
    if (needsImplementer && !implementer.model)
      return setError("Choose an implementer model.");
    if (
      risky &&
      mode === "implement_review_qa" &&
      (!approvalAuthor.trim() || approvalReason.trim().length < 5)
    )
      return setError(
        "Risky changes need your name and a reason for the approval.",
      );
    inFlight.current = true;
    setSaving(true);
    if (risky) rememberAuthor(approvalAuthor);
    const payload = {
      projectId: project.id,
      title: title.trim(),
      criteria: criteria.trim(),
      mode,
      refs: fixing ? {} : refs,
      sourceSnapshotId: seed?.sourceSnapshotId,
      issueKeys: issues,
      dependencyPins: pins.filter((p) => p.issue || p.sha),
      blockers: seed?.blockers ?? [],
      implementer: needsImplementer ? implementer : undefined,
      reviewer: needsReviewer ? reviewer : undefined,
      maxReviewRounds: rounds,
      maxRunMinutes: minutes,
      demoScenario: project.demo ? demoScenario : "pass",
      risky,
      ...(risky
        ? {
            riskApproval: {
              author: approvalAuthor.trim(),
              reason: approvalReason.trim(),
            },
          }
        : {}),
    };
    const created = await hub.call<Task>("change-sets", payload);
    if (!created.ok) {
      inFlight.current = false;
      setSaving(false);
      return setError(created.error);
    }
    // The task exists from here on; never create it twice from this dialog.
    let run: Run | null = null;
    let startError: string | undefined;
    if (start) {
      const started = await hub.call<Run>(
        `change-sets/${created.data.id}/runs`,
        {},
        crypto.randomUUID(),
      );
      if (started.ok) run = started.data;
      else startError = started.error;
    }
    await hub.reload();
    onDone({ task: created.data, run, startError });
  };

  const job = linearJob ? state.jobs.find((j) => j.id === linearJob) : null;
  const linearError =
    job?.state === "failed"
      ? state.notices.find((n) => n.type === "error")?.message
      : null;

  return (
    <div
      className="backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-dialog-title"
      >
        <div className="dialog-head">
          <div className="row">
            <h2 id="task-dialog-title">
              {fixing ? "Prepare a fix" : "New task"}
            </h2>
            {project?.demo && <DemoTag />}
          </div>
          <div className="row">
            {!fixing && (
              <Segmented
                label="How to create the task"
                value={tab}
                onChange={setTab}
                options={[
                  { value: "write", label: "Write it" },
                  { value: "linear", label: "From Linear" },
                ]}
              />
            )}
            <button
              className="icon-btn"
              aria-label="Close"
              onClick={requestClose}
            >
              <Icon name="x" />
            </button>
          </div>
        </div>
        {tab === "linear" ? (
          <form
            className="dialog-body"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!project) return;
              const res = await hub.call<{ id: string }>(
                "integrations/linear/import",
                {
                  projectId: project.id,
                  issueId: linearIssue.trim(),
                },
              );
              if (!res.ok) return setError(res.error);
              setLinearJob(res.data.id);
              await hub.reload();
            }}
          >
            {!state.linearConfigured && (
              <Banner tone="warn">
                Linear isn’t connected. Set <code>HUB_LINEAR_TOKEN</code> for
                the hub process and restart it.
              </Banner>
            )}
            <p className="muted">
              Imports one issue with its description and related issues as a new
              task. Nothing starts, and nothing is written back to Linear.
            </p>
            <div className="form-grid">
              <Field label="Project">
                {(id) => (
                  <select
                    id={id}
                    className="select"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Issue ID">
                {(id) => (
                  <input
                    id={id}
                    className="input"
                    required
                    pattern="[a-zA-Z0-9_-]{1,100}"
                    placeholder="PLAT-412"
                    value={linearIssue}
                    onChange={(e) => setLinearIssue(e.target.value)}
                  />
                )}
              </Field>
            </div>
            {job && (
              <Banner
                tone={
                  job.state === "done"
                    ? "ok"
                    : job.state === "failed"
                      ? "bad"
                      : "info"
                }
              >
                {job.state === "done"
                  ? "Imported. The task is in Tasks, ready to start."
                  : job.state === "failed"
                    ? `Import failed${linearError ? `: ${linearError}` : "."}`
                    : "Importing…"}
              </Banner>
            )}
            {error && <Banner tone="bad">{error}</Banner>}
            <div className="row">
              <button
                className="btn btn-primary"
                disabled={!state.linearConfigured || !linearIssue.trim()}
              >
                Import issue
              </button>
              {job?.state === "done" && (
                <button type="button" className="btn" onClick={onClose}>
                  Close
                </button>
              )}
            </div>
          </form>
        ) : (
          <form
            className="dialog-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(!fixing);
            }}
          >
            <div className="dialog-body">
              {!fixing && projects.length > 1 && (
                <Field label="Project">
                  {(id) => (
                    <select
                      id={id}
                      className="select"
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              )}
              {fixing && (
                <Banner tone="info">
                  Starts from the exact version of the earlier run, with the
                  findings added to the acceptance criteria. Review the text
                  before starting.
                </Banner>
              )}
              <Field label="Title">
                {(id) => (
                  <input
                    id={id}
                    className="input"
                    required
                    maxLength={200}
                    value={title}
                    placeholder="PLAT-412 · Event capacity limit"
                    onChange={(e) => setTitle(e.target.value)}
                  />
                )}
              </Field>
              <Field
                label="Acceptance criteria"
                help="What must be true when the work is done. Reviewers and testers check against this."
              >
                {(id) => (
                  <textarea
                    id={id}
                    className="textarea"
                    required
                    rows={4}
                    value={criteria}
                    placeholder="Registration stops at capacity and shows a clear message. Admin shows the waiting list."
                    onChange={(e) => setCriteria(e.target.value)}
                  />
                )}
              </Field>
              <Field
                label="Linked issues"
                optional
                help="Press Enter after each issue key."
              >
                {(id) => (
                  <ChipInput
                    id={id}
                    label="Linked issues"
                    values={issues}
                    onChange={setIssues}
                    placeholder="PLAT-412"
                    normalize={(v) => v.trim().toUpperCase()}
                  />
                )}
              </Field>
              <fieldset
                style={{ border: 0, padding: 0, margin: 0 }}
                className="stack"
              >
                <legend className="block-title" style={{ marginBottom: 8 }}>
                  How should the hub work on it?
                </legend>
                <div className="mode-cards">
                  {MODE_ORDER.map((m) => (
                    <label className="mode-card" key={m}>
                      <input
                        type="radio"
                        name="mode"
                        value={m}
                        checked={mode === m}
                        onChange={() => setMode(m)}
                      />
                      <b>{MODE_LABELS[m].title}</b>
                      <small>{MODE_LABELS[m].description}</small>
                    </label>
                  ))}
                </div>
              </fieldset>
              {!fixing && project && (
                <div className="stack">
                  <span className="block-title">Which code?</span>
                  <div className="form-grid three">
                    {project.repositories.map((r) => (
                      <Field
                        key={r.key}
                        label={r.key}
                        help={`Compared against ${r.baselineRef}`}
                      >
                        {(id) => (
                          <>
                            <input
                              id={id}
                              className="input"
                              list={id + "-branches"}
                              required
                              value={refs[r.key] ?? ""}
                              onChange={(e) =>
                                setRefs({ ...refs, [r.key]: e.target.value })
                              }
                            />
                            <datalist id={id + "-branches"}>
                              {(branches[r.key] ?? []).map((b) => (
                                <option key={b} value={b} />
                              ))}
                            </datalist>
                          </>
                        )}
                      </Field>
                    ))}
                  </div>
                </div>
              )}
              {mode !== "qa_only" && (
                <div className="stack">
                  <div className="ai-line">
                    <span>
                      {needsImplementer && (
                        <>
                          <b>Implementer:</b> {roleSummary(implementer)}
                          <br />
                        </>
                      )}
                      <b>Reviewer:</b> {roleSummary(reviewer)}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      aria-expanded={showAi}
                      onClick={() => setShowAi(!showAi)}
                    >
                      {showAi ? "Done" : "Change"}
                    </button>
                  </div>
                  {showAi && (
                    <div className="form-grid">
                      {needsImplementer && (
                        <RolePicker
                          title="Implementer"
                          description="Writes the change on the run’s own copies."
                          value={implementer}
                          models={settings.models ?? []}
                          allowDemo={project?.demo}
                          onChange={(r) => r && setImplementer(r)}
                        />
                      )}
                      <RolePicker
                        title="Reviewer"
                        description="Reads the change and reports findings. Never edits code."
                        value={reviewer}
                        models={settings.models ?? []}
                        allowDemo={project?.demo}
                        onChange={(r) => r && setReviewer(r)}
                      />
                    </div>
                  )}
                </div>
              )}
              <Disclosure
                summary="More options"
                hint="limits, dependencies, risky changes"
              >
                <div className="cap-row">
                  <div>
                    <b>Review rounds</b>
                    <small>
                      At most this many reviews, with an automatic fix between
                      them in Implement mode.
                    </small>
                  </div>
                  <Stepper
                    label="Review rounds"
                    value={rounds}
                    min={1}
                    max={3}
                    onChange={setRounds}
                  />
                </div>
                <div className="cap-row">
                  <div>
                    <b>Time limit for the whole run</b>
                    <small>
                      The run stops and is marked interrupted after this long.
                    </small>
                  </div>
                  <Stepper
                    label="Run time limit"
                    value={minutes}
                    min={5}
                    max={120}
                    step={5}
                    unit="min"
                    onChange={setMinutes}
                  />
                </div>
                {project?.demo && (
                  <Field
                    label="DEMO fixture scenario"
                    help="Synthetic outcomes for trying the hub without real AI."
                  >
                    {(id) => (
                      <select
                        id={id}
                        className="select"
                        value={demoScenario}
                        onChange={(e) => setDemoScenario(e.target.value)}
                      >
                        {DEMO_SCENARIOS.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                )}
                <div className="field">
                  <div className="spread">
                    <span className="field-label">
                      Depends on other changes
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() =>
                        setPins([
                          ...pins,
                          {
                            issue: "",
                            repoKey: project?.repositories[0]?.key ?? "",
                            sha: "",
                          },
                        ])
                      }
                    >
                      <Icon name="plus" /> Add dependency
                    </button>
                  </div>
                  <span className="field-help">
                    Pin the exact commit that contains another issue’s change.
                    The selected code must include it.
                  </span>
                  {pins.map((p, i) => {
                    const setPin = (patch: Partial<Pin>) =>
                      setPins(
                        pins.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                      );
                    return (
                      <div
                        className="form-grid three"
                        key={i}
                        style={{ alignItems: "end" }}
                      >
                        <input
                          className="input"
                          aria-label="Dependency issue"
                          placeholder="PLAT-400"
                          value={p.issue}
                          onChange={(e) => setPin({ issue: e.target.value })}
                        />
                        <select
                          className="select"
                          aria-label="Dependency repository"
                          value={p.repoKey}
                          onChange={(e) => setPin({ repoKey: e.target.value })}
                        >
                          {project?.repositories.map((r) => (
                            <option key={r.key} value={r.key}>
                              {r.key}
                            </option>
                          ))}
                        </select>
                        <div className="input-row">
                          <input
                            className="input mono"
                            aria-label="Dependency commit"
                            placeholder="40-character commit SHA"
                            pattern="[0-9a-f]{40,64}"
                            value={p.sha}
                            onChange={(e) =>
                              setPin({ sha: e.target.value.trim() })
                            }
                          />
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label="Remove dependency"
                            onClick={() =>
                              setPins(pins.filter((_, j) => j !== i))
                            }
                          >
                            <Icon name="trash" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={risky}
                    onChange={(e) => setRisky(e.target.checked)}
                  />
                  <span>
                    Touches login, permissions, payments or destructive
                    migrations.{" "}
                    <span className="muted">
                      Implement runs need a named approval before they start.
                    </span>
                  </span>
                </label>
                {risky && (
                  <div className="form-grid">
                    <Field label="Approved by">
                      {(id) => (
                        <input
                          id={id}
                          className="input"
                          value={approvalAuthor}
                          onChange={(e) => setApprovalAuthor(e.target.value)}
                        />
                      )}
                    </Field>
                    <Field label="Why it’s acceptable">
                      {(id) => (
                        <input
                          id={id}
                          className="input"
                          value={approvalReason}
                          onChange={(e) => setApprovalReason(e.target.value)}
                        />
                      )}
                    </Field>
                  </div>
                )}
              </Disclosure>
              {project && (
                <div className="summary-box">
                  <b>Starting will</b>
                  <ul>
                    <li>
                      {fixing
                        ? "continue from the exact version of the earlier run"
                        : `pin the exact commits of ${project.repositories.length} ${project.repositories.length === 1 ? "repository" : "repositories"} and work on the hub’s own copies`}
                    </li>
                    {mode === "implement_review_qa" && (
                      <li>
                        let one agent change those copies (
                        {PROVIDER_LABELS[implementer.provider]}), then review it
                        with {PROVIDER_LABELS[reviewer.provider]}, up to{" "}
                        {rounds} {rounds === 1 ? "round" : "rounds"}
                      </li>
                    )}
                    {mode === "review_qa" && (
                      <li>
                        run one read-only code review (
                        {PROVIDER_LABELS[reviewer.provider]})
                      </li>
                    )}
                    {mode === "qa_only" && <li>use no AI</li>}
                    <li>
                      run {commands.length} approved{" "}
                      {commands.length === 1 ? "command" : "commands"} and check{" "}
                      {required.length} required{" "}
                      {required.length === 1 ? "scenario" : "scenarios"}
                    </li>
                    {mode !== "qa_only" &&
                      [implementer, reviewer].some(
                        (r) => r.provider !== "fake",
                      ) && (
                        <li>
                          send the task and the code it needs to the AI provider
                          through your CLI account
                        </li>
                      )}
                    <li>push, merge or publish nothing</li>
                  </ul>
                </div>
              )}
              {warnings.map((w) => (
                <Banner tone="warn" key={w}>
                  {w}
                </Banner>
              ))}
              {error && (
                <Banner tone="bad" role="alert">
                  {error}
                </Banner>
              )}
            </div>
            <div className="dialog-foot">
              <span className="muted" style={{ fontSize: "0.88rem" }}>
                {fixing
                  ? "Saving doesn’t start the fix."
                  : "Nothing runs until you start it."}
              </span>
              <div className="row">
                {fixing ? (
                  <>
                    <button
                      type="button"
                      className="btn"
                      disabled={saving || !project}
                      onClick={() => void submit(true)}
                    >
                      Save and start run
                    </button>
                    <button
                      className="btn btn-primary"
                      disabled={saving || !project}
                    >
                      Save
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn"
                      disabled={saving || !project}
                      onClick={() => void submit(false)}
                    >
                      Save for later
                    </button>
                    <button
                      className="btn btn-primary"
                      disabled={saving || !project}
                    >
                      {saving ? "Starting…" : "Save and start run"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
