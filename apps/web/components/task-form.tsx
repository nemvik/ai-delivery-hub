"use client";
import { useState } from "react";
import type {
  Project,
  Task,
  Settings,
} from "../../../packages/contracts/src/index";
export function TaskForm({
  projects,
  defaultRoles,
  seed,
  onClose,
  onSave,
  busy,
}: {
  projects: Project[];
  defaultRoles?: Settings["defaultRoles"];
  seed?: Partial<Task>;
  onClose: () => void;
  onSave: (value: unknown) => Promise<void>;
  busy: boolean;
}) {
  const [projectId, setProjectId] = useState(
      seed?.projectId || projects[0]?.id || "",
    ),
    [mode, setMode] = useState(seed?.mode || "review_qa");
  const project = projects.find((p) => p.id === projectId)!;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const role = (name: string) =>
      f.get(name + "Model")
        ? {
            provider: f.get(name + "Provider"),
            model: f.get(name + "Model"),
            effort: String(f.get(name + "Effort") || "") || null,
            timeoutSeconds: 1800,
            maxTurns: null,
          }
        : undefined;
    const dependencyPins = JSON.parse(String(f.get("pins") || "[]"));
    await onSave({
      projectId,
      title: f.get("title"),
      criteria: f.get("criteria"),
      mode,
      refs: seed?.sourceSnapshotId
        ? {}
        : Object.fromEntries(
            project.repositories.map((r) => [
              r.key,
              String(f.get("ref-" + r.key) || r.baselineRef),
            ]),
          ),
      sourceSnapshotId: seed?.sourceSnapshotId,
      issueKeys: String(f.get("issues") || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      dependencyPins,
      blockers: seed?.blockers || [],
      implementer: role("implementer"),
      reviewer: role("reviewer"),
      maxReviewRounds: Number(f.get("rounds")),
      maxRunMinutes: Number(f.get("minutes")),
      demoScenario: f.get("scenario") || "pass",
      risky: f.get("risky") === "on",
      ...(f.get("risky") === "on"
        ? { riskApproval: { author: f.get("author"), reason: f.get("reason") } }
        : {}),
    });
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-task"
      >
        <div className="section-title">
          <h2 id="new-task">
            {seed ? "Accept findings & prepare a fix" : "New task"}
          </h2>
          <button onClick={onClose} aria-label="Close task form">
            ×
          </button>
        </div>
        <form
          onSubmit={(e) =>
            void submit(e).catch((error) => window.alert(String(error)))
          }
        >
          <label>
            Project
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={!!seed}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Title
            <input
              name="title"
              required
              defaultValue={seed?.title}
              placeholder="Verify a prepared change"
              maxLength={200}
            />
          </label>
          <label>
            Acceptance criteria
            <textarea
              name="criteria"
              required
              rows={3}
              defaultValue={seed?.criteria}
            />
          </label>
          <label>
            Mode
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as Task["mode"])}
            >
              <option value="review_qa">
                Review + QA · no automatic edits
              </option>
              <option value="qa_only">QA only</option>
              <option value="implement_review_qa">
                Implement + review + QA
              </option>
            </select>
          </label>
          <fieldset>
            <legend>Exact source revisions</legend>
            {seed?.sourceSnapshotId ? (
              <p>Continue immutable snapshot {seed.sourceSnapshotId}</p>
            ) : (
              project.repositories.map((r) => (
                <label key={r.key}>
                  {r.key}
                  <input
                    name={"ref-" + r.key}
                    defaultValue={r.baselineRef}
                    required
                  />
                </label>
              ))
            )}
          </fieldset>
          <div className="form-columns">
            {(["implementer", "reviewer"] as const).map((name) => (
              <fieldset key={projectId + name}>
                <legend>{name}</legend>
                <label>
                  Provider
                  <select
                    name={name + "Provider"}
                    defaultValue={
                      seed?.[name]?.provider ||
                      project.defaultRoles?.[name]?.provider ||
                      defaultRoles?.[name]?.provider ||
                      (project.demo
                        ? "fake"
                        : name === "implementer"
                          ? "codex-cli"
                          : "claude-code-cli")
                    }
                  >
                    {project.demo && (
                      <option value="fake">DEMO deterministic</option>
                    )}
                    <option value="codex-cli">Codex CLI</option>
                    <option value="claude-code-cli">Claude Code CLI</option>
                  </select>
                </label>
                <label>
                  Model ID
                  <input
                    name={name + "Model"}
                    required={
                      mode !== "qa_only" &&
                      (name === "reviewer" || mode === "implement_review_qa")
                    }
                    defaultValue={
                      seed?.[name]?.model ||
                      project.defaultRoles?.[name]?.model ||
                      defaultRoles?.[name]?.model ||
                      (project.demo ? "demo-deterministic" : "")
                    }
                    placeholder="Model verified in Settings"
                  />
                </label>
                <label>
                  Effort
                  <input
                    name={name + "Effort"}
                    defaultValue={
                      seed?.[name]?.effort ||
                      project.defaultRoles?.[name]?.effort ||
                      defaultRoles?.[name]?.effort ||
                      ""
                    }
                    placeholder="Provider-specific or blank"
                  />
                </label>
              </fieldset>
            ))}
          </div>
          <div className="form-columns">
            <label>
              Maximum reviews
              <input
                type="number"
                min="1"
                max="3"
                name="rounds"
                defaultValue={3}
              />
            </label>
            <label>
              Maximum run minutes
              <input
                type="number"
                min="1"
                max="120"
                name="minutes"
                defaultValue={120}
              />
            </label>
          </div>
          {project.demo && (
            <label>
              DEMO fixture scenario
              <select
                name="scenario"
                defaultValue={seed?.demoScenario || "pass"}
              >
                <option value="pass">Passing fixture</option>
                <option value="web-fail">Real web assertion failure</option>
                <option value="contract-defect">
                  Repairable cross-repo defect
                </option>
                <option value="limit">Persistent finding / review limit</option>
                <option value="hang">Long process / cancel</option>
              </select>
            </label>
          )}
          <details>
            <summary>Issues, dependency pins & risk approval</summary>
            <label>
              Issue keys, comma separated
              <input name="issues" defaultValue={seed?.issueKeys?.join(", ")} />
            </label>
            <label>
              Dependency pins (JSON)
              <textarea
                name="pins"
                rows={3}
                defaultValue={JSON.stringify(seed?.dependencyPins || [])}
              />
            </label>
            <label className="checkbox">
              <input name="risky" type="checkbox" /> Changes to auth,
              permissions, payments or destructive migrations
            </label>
            <label>
              Approval author
              <input name="author" />
            </label>
            <label>
              Approval reason
              <input name="reason" minLength={5} />
            </label>
          </details>
          <div className="scope-summary">
            <strong>Start will run this approved scope</strong>
            <p>
              {project.repositories.length} managed worktrees ·{" "}
              {mode === "qa_only"
                ? "no agents"
                : mode === "review_qa"
                  ? "read-only reviewer"
                  : "one writer + independent reviewer"}{" "}
              · {project.scenarios.filter((s) => s.required).length} required
              scenarios
            </p>
            <ul>
              {project.commands.map((c) => (
                <li key={c.id}>
                  <code>
                    {c.repoKey}: {c.executable} {c.args.join(" ")}
                  </code>
                </li>
              ))}
            </ul>
            <p>
              Real providers receive task and source context through their
              official CLI account. Publication is a separate explicit action.
            </p>
          </div>
          <button className="primary" disabled={busy}>
            Save task · start separately
          </button>
        </form>
      </section>
    </div>
  );
}
