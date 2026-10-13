"use client";
import { useState } from "react";
import type {
  Command,
  Project,
  Scenario,
} from "../../../../packages/contracts/src/index";
import { parseCommandLine, formatCommandLine } from "../../lib/command-line";
import {
  COMMAND_KINDS,
  COMMAND_PHASES,
  PLACEHOLDERS,
  SCENARIO_KINDS,
  SURFACE_KINDS,
} from "../../lib/labels";
import { ChipInput, Field, Icon, Pill, Section, Stepper } from "../ui";

type Draft = Omit<Project, "id" | "createdAt" | "archived">;
type Surface = Project["surfaces"][number];
const KEY = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "item";

function SurfacesBlock({
  draft,
  update,
}: {
  draft: Draft;
  update: (p: Partial<Draft>) => void;
}) {
  const set = (i: number, patch: Partial<Surface>) =>
    update({
      surfaces: draft.surfaces.map((s, j) =>
        j === i ? { ...s, ...patch } : s,
      ),
    });
  return (
    <Section
      title="What gets tested"
      description="Surfaces are the parts of the product a test can touch: the admin web, the API, the iOS app. Two surfaces can live in one repository."
      actions={
        <button
          type="button"
          className="btn btn-sm"
          onClick={() =>
            update({
              surfaces: [
                ...draft.surfaces,
                {
                  key: "surface-" + (draft.surfaces.length + 1),
                  repoKey: draft.repositories[0]?.key ?? "",
                  kind: "web",
                  cwd: ".",
                },
              ],
            })
          }
        >
          <Icon name="plus" /> Add surface
        </button>
      }
    >
      {!draft.surfaces.length ? (
        <p className="empty-inline">
          No surfaces yet. Add one for each part of the product you want
          scenarios for.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Repository</th>
                <th>Folder</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {draft.surfaces.map((s, i) => (
                <tr key={i}>
                  <td>
                    <input
                      className="input"
                      aria-label="Surface name"
                      aria-invalid={!KEY.test(s.key)}
                      value={s.key}
                      onChange={(e) => set(i, { key: e.target.value.trim() })}
                    />
                  </td>
                  <td>
                    <select
                      className="select"
                      aria-label="Surface kind"
                      value={s.kind}
                      onChange={(e) =>
                        set(i, { kind: e.target.value as Surface["kind"] })
                      }
                    >
                      {SURFACE_KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="select"
                      aria-label="Surface repository"
                      value={s.repoKey}
                      onChange={(e) => set(i, { repoKey: e.target.value })}
                    >
                      {draft.repositories.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.key}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="input mono"
                      aria-label="Surface folder"
                      value={s.cwd}
                      onChange={(e) =>
                        set(i, { cwd: e.target.value.trim() || "." })
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Remove surface ${s.key}`}
                      onClick={() =>
                        update({
                          surfaces: draft.surfaces.filter((_, j) => j !== i),
                        })
                      }
                    >
                      <Icon name="trash" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function CommandEditor({
  initial,
  draft,
  onSave,
  onCancel,
}: {
  initial: Command;
  draft: Draft;
  onSave: (c: Command) => void;
  onCancel: () => void;
}) {
  const [c, setC] = useState<Command>(initial);
  const [line, setLine] = useState(
    initial.executable
      ? formatCommandLine(initial.executable, initial.args)
      : "",
  );
  const [error, setError] = useState("");
  let parsed: { executable: string; args: string[] } | null = null;
  let lineError = "";
  try {
    parsed = line.trim() ? parseCommandLine(line) : null;
  } catch (e) {
    lineError = (e as Error).message;
  }
  const set = (patch: Partial<Command>) => setC({ ...c, ...patch });
  const kind = COMMAND_KINDS.find((k) => k.value === c.kind)!;
  const save = () => {
    if (!KEY.test(c.id))
      return setError(
        "Give the command a short name: letters, numbers, - or _.",
      );
    if (!parsed) return setError(lineError || "Enter the command to run.");
    if (c.kind === "suite" && !c.reportPath)
      return setError("A test suite needs the path of its result report.");
    onSave({ ...c, executable: parsed.executable, args: parsed.args });
  };
  return (
    <div className="item-card editing">
      <div className="form-grid">
        <Field
          label="Name"
          help="Short ID shown in results, e.g. lint or web-qa."
        >
          {(id) => (
            <input
              id={id}
              className="input"
              value={c.id}
              onChange={(e) => set({ id: e.target.value.trim() })}
            />
          )}
        </Field>
        <Field label="Repository">
          {(id) => (
            <select
              id={id}
              className="select"
              value={c.repoKey}
              onChange={(e) => set({ repoKey: e.target.value })}
            >
              {draft.repositories.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.key}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label="Command"
          className="span"
          error={lineError || null}
          help={`Runs directly, without a shell. Quotes keep spaces together. Available placeholders: ${PLACEHOLDERS.join(" ")}`}
        >
          {(id) => (
            <input
              id={id}
              className="input mono"
              value={line}
              placeholder="pnpm exec playwright test --project admin"
              onChange={(e) => setLine(e.target.value)}
            />
          )}
        </Field>
        {parsed && (
          <div className="span field">
            <span className="field-label">Runs exactly as</span>
            <div className="chips">
              <span className="chip arg">{parsed.executable}</span>
              {parsed.args.map((a, i) => (
                <span className="chip arg" key={i}>
                  {a === "" ? "(empty)" : a}
                </span>
              ))}
            </div>
          </div>
        )}
        <Field label="Type" help={kind.help}>
          {(id) => (
            <select
              id={id}
              className="select"
              value={c.kind}
              onChange={(e) => set({ kind: e.target.value as Command["kind"] })}
            >
              {COMMAND_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label="When it runs"
          help="Repository checks run before the review; QA runs against the started product."
        >
          {(id) => (
            <select
              id={id}
              className="select"
              value={c.phase}
              onChange={(e) =>
                set({ phase: e.target.value as Command["phase"] })
              }
            >
              {COMMAND_PHASES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Working folder" help="Relative to the repository root.">
          {(id) => (
            <input
              id={id}
              className="input mono"
              value={c.cwd}
              onChange={(e) => set({ cwd: e.target.value.trim() || "." })}
            />
          )}
        </Field>
        <div className="field">
          <span className="field-label">Time limit</span>
          <Stepper
            label="Command time limit"
            value={Math.max(1, Math.round(c.timeoutSeconds / 60))}
            min={1}
            max={120}
            unit="min"
            onChange={(m) => set({ timeoutSeconds: m * 60 })}
          />
        </div>
        {c.kind === "suite" && (
          <Field
            label="Result report"
            className="span"
            help="JSON file the suite writes, in the hub's QA result format (see examples/qa-result.example.json)."
          >
            {(id) => (
              <input
                id={id}
                className="input mono"
                value={c.reportPath ?? ""}
                placeholder="build/hub-result.json"
                onChange={(e) =>
                  set({ reportPath: e.target.value.trim() || undefined })
                }
              />
            )}
          </Field>
        )}
        <Field
          label="Secrets it needs"
          optional
          help="Names only. TEST_PASSWORD is read from HUB_QA_TEST_PASSWORD in the worker's environment and given only to this command."
        >
          {(id) => (
            <ChipInput
              id={id}
              label="Secrets it needs"
              values={c.envRefs}
              onChange={(envRefs) => set({ envRefs })}
              placeholder="TEST_PASSWORD"
              validate={(v) =>
                KEY.test(v) ? null : "Letters, numbers, - or _ only."
              }
            />
          )}
        </Field>
        <Field
          label="Exclusive resources"
          optional
          help="Only one run at a time may use these, e.g. staging-db."
        >
          {(id) => (
            <ChipInput
              id={id}
              label="Exclusive resources"
              values={c.resourceIds}
              onChange={(resourceIds) => set({ resourceIds })}
              placeholder="staging-db"
              validate={(v) =>
                KEY.test(v) ? null : "Letters, numbers, - or _ only."
              }
            />
          )}
        </Field>
      </div>
      <div className="field">
        <div className="spread">
          <span className="field-label">Evidence files it produces</span>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() =>
              set({
                artifacts: [
                  ...c.artifacts,
                  {
                    id: "evidence-" + (c.artifacts.length + 1),
                    path: "build/screenshot.png",
                    scenarioId: draft.scenarios[0]?.id ?? "",
                    surfaceKey: draft.surfaces[0]?.key ?? "",
                  },
                ],
              })
            }
          >
            <Icon name="plus" /> Add file
          </button>
        </div>
        {c.artifacts.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>File</th>
                  <th>Scenario</th>
                  <th>Surface</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {c.artifacts.map((a, i) => {
                  const setA = (patch: Partial<typeof a>) =>
                    set({
                      artifacts: c.artifacts.map((x, j) =>
                        j === i ? { ...x, ...patch } : x,
                      ),
                    });
                  return (
                    <tr key={i}>
                      <td>
                        <input
                          className="input"
                          aria-label="Evidence ID"
                          value={a.id}
                          onChange={(e) => setA({ id: e.target.value.trim() })}
                        />
                      </td>
                      <td>
                        <input
                          className="input mono"
                          aria-label="Evidence file"
                          value={a.path}
                          onChange={(e) =>
                            setA({ path: e.target.value.trim() })
                          }
                        />
                      </td>
                      <td>
                        <select
                          className="select"
                          aria-label="Evidence scenario"
                          value={a.scenarioId}
                          onChange={(e) => setA({ scenarioId: e.target.value })}
                        >
                          {draft.scenarios.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.title}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className="select"
                          aria-label="Evidence surface"
                          value={a.surfaceKey}
                          onChange={(e) => setA({ surfaceKey: e.target.value })}
                        >
                          {draft.surfaces.map((s) => (
                            <option key={s.key} value={s.key}>
                              {s.key}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="Remove evidence file"
                          onClick={() =>
                            set({
                              artifacts: c.artifacts.filter((_, j) => j !== i),
                            })
                          }
                        >
                          <Icon name="trash" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <span className="field-help">
            Screenshots or traces the command writes, linked to a scenario.
          </span>
        )}
      </div>
      {error && <span className="field-error">{error}</span>}
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={save}>
          Done
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ScenarioEditor({
  initial,
  draft,
  isNew,
  onSave,
  onCancel,
}: {
  initial: Scenario;
  draft: Draft;
  isNew: boolean;
  onSave: (s: Scenario) => void;
  onCancel: () => void;
}) {
  const [s, setS] = useState<Scenario>(initial);
  const [error, setError] = useState("");
  const set = (patch: Partial<Scenario>) => setS({ ...s, ...patch });
  const suites = draft.commands.filter((c) => c.kind === "suite");
  const save = () => {
    if (!s.title.trim()) return setError("Give the scenario a title.");
    if (!KEY.test(s.id))
      return setError("The ID may use letters, numbers, - or _.");
    if (!s.surfaceKeys.length) return setError("Pick at least one surface.");
    if (!s.expected.trim()) return setError("Describe what should happen.");
    onSave({ ...s, title: s.title.trim(), expected: s.expected.trim() });
  };
  return (
    <div className="item-card editing">
      <div className="form-grid">
        <Field label="Title">
          {(id) => (
            <input
              id={id}
              className="input"
              value={s.title}
              placeholder="New attendee appears in admin"
              onChange={(e) =>
                set({
                  title: e.target.value,
                  ...(isNew ? { id: slug(e.target.value) } : {}),
                })
              }
            />
          )}
        </Field>
        <Field
          label="ID"
          help="Used by test reports to refer to this scenario."
        >
          {(id) => (
            <input
              id={id}
              className="input mono"
              value={s.id}
              onChange={(e) => set({ id: e.target.value.trim() })}
            />
          )}
        </Field>
        <Field label="Kind">
          {(id) => (
            <select
              id={id}
              className="select"
              value={s.kind}
              onChange={(e) =>
                set({ kind: e.target.value as Scenario["kind"] })
              }
            >
              {SCENARIO_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label="Verified by"
          optional
          help="A test suite that reports this scenario's result."
        >
          {(id) => (
            <select
              id={id}
              className="select"
              value={s.commandId ?? ""}
              onChange={(e) => set({ commandId: e.target.value || undefined })}
            >
              <option value="">
                {s.kind === "manual" ? "A person, during QA" : "Not linked"}
              </option>
              {suites.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="What should happen" className="span">
          {(id) => (
            <textarea
              id={id}
              className="textarea"
              value={s.expected}
              placeholder="The newly registered participant appears in the admin list with the same e-mail."
              onChange={(e) => set({ expected: e.target.value })}
            />
          )}
        </Field>
        <div className="field span">
          <span className="field-label">Surfaces involved</span>
          {draft.surfaces.length ? (
            <div className="chips">
              {draft.surfaces.map((x) => (
                <label
                  className="check chip"
                  key={x.key}
                  style={{ padding: "3px 10px" }}
                >
                  <input
                    type="checkbox"
                    checked={s.surfaceKeys.includes(x.key)}
                    onChange={(e) =>
                      set({
                        surfaceKeys: e.target.checked
                          ? [...s.surfaceKeys, x.key]
                          : s.surfaceKeys.filter((k) => k !== x.key),
                      })
                    }
                  />
                  {x.key}
                </label>
              ))}
            </div>
          ) : (
            <span className="field-help">Add a surface first.</span>
          )}
        </div>
        <label className="check span">
          <input
            type="checkbox"
            checked={s.required}
            onChange={(e) => set({ required: e.target.checked })}
          />
          <span>
            Required.{" "}
            <span className="muted">
              A run can only pass when this scenario passes.
            </span>
          </span>
        </label>
      </div>
      {error && <span className="field-error">{error}</span>}
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={save}>
          Done
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function TestsSection({
  draft,
  update,
}: {
  draft: Draft;
  update: (p: Partial<Draft>) => void;
}) {
  const [editCommand, setEditCommand] = useState<number | "new" | null>(null);
  const [editScenario, setEditScenario] = useState<number | "new" | null>(null);
  const blankCommand: Command = {
    id: "",
    repoKey: draft.repositories[0]?.key ?? "",
    executable: "",
    args: [],
    cwd: ".",
    timeoutSeconds: 300,
    kind: "check",
    phase: "repo",
    envRefs: [],
    resourceIds: [],
    artifacts: [],
  };
  const blankScenario: Scenario = {
    id: "",
    title: "",
    required: true,
    kind: "web",
    surfaceKeys: draft.surfaces[0] ? [draft.surfaces[0].key] : [],
    expected: "",
  };
  const kindLabel = (k: string) =>
    COMMAND_KINDS.find((x) => x.value === k)?.label ?? k;
  const scenarioKind = (k: string) =>
    SCENARIO_KINDS.find((x) => x.value === k)?.label ?? k;
  return (
    <div className="stack-lg">
      {!draft.scenarios.some(
        (s) => s.required && s.kind !== "manual" && s.kind !== "native",
      ) && (
        <div className="banner tone-warn">
          <Icon name="alert" />
          <div className="grow">
            <b>No required automated scenario yet.</b> Runs can still review
            code, but they can’t pass QA until at least one required web,
            contract or command scenario passes.
          </div>
        </div>
      )}
      <SurfacesBlock draft={draft} update={update} />
      <Section
        title="Commands"
        description="Commands the hub may run: checks like lint and unit tests, test suites, builds and services to start. Nothing else is ever executed."
        actions={
          editCommand === null && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setEditCommand("new")}
            >
              <Icon name="plus" /> Add command
            </button>
          )
        }
      >
        <div className="stack">
          {draft.commands.map((c, i) =>
            editCommand === i ? (
              <CommandEditor
                key={i}
                initial={c}
                draft={draft}
                onCancel={() => setEditCommand(null)}
                onSave={(next) => {
                  update({
                    commands: draft.commands.map((x, j) =>
                      j === i ? next : x,
                    ),
                  });
                  setEditCommand(null);
                }}
              />
            ) : (
              <div className="item-card" key={i}>
                <div className="item-head">
                  <div className="grow">
                    <div className="row">
                      <b>{c.id}</b>
                      <Pill tone="idle">{kindLabel(c.kind)}</Pill>
                      <span className="muted" style={{ fontSize: "0.86rem" }}>
                        {c.repoKey} ·{" "}
                        {c.phase === "qa" ? "QA" : "repository checks"} ·{" "}
                        {Math.round(c.timeoutSeconds / 60)} min
                      </span>
                    </div>
                    <div className="path">
                      {formatCommandLine(c.executable, c.args)}
                    </div>
                  </div>
                  <div className="row">
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => setEditCommand(i)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost btn-danger"
                      onClick={() =>
                        update({
                          commands: draft.commands.filter((_, j) => j !== i),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ),
          )}
          {editCommand === "new" && (
            <CommandEditor
              initial={blankCommand}
              draft={draft}
              onCancel={() => setEditCommand(null)}
              onSave={(next) => {
                update({ commands: [...draft.commands, next] });
                setEditCommand(null);
              }}
            />
          )}
          {!draft.commands.length && editCommand === null && (
            <p className="empty-inline">No commands yet.</p>
          )}
        </div>
      </Section>
      <Section
        title="Scenarios"
        description="Behaviour that must work, written so a person can check it. Required scenarios decide whether a run passes."
        actions={
          editScenario === null && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setEditScenario("new")}
            >
              <Icon name="plus" /> Add scenario
            </button>
          )
        }
      >
        <div className="stack">
          {draft.scenarios.map((s, i) =>
            editScenario === i ? (
              <ScenarioEditor
                key={i}
                initial={s}
                isNew={false}
                draft={draft}
                onCancel={() => setEditScenario(null)}
                onSave={(next) => {
                  update({
                    scenarios: draft.scenarios.map((x, j) =>
                      j === i ? next : x,
                    ),
                  });
                  setEditScenario(null);
                }}
              />
            ) : (
              <div className="item-card" key={i}>
                <div className="item-head">
                  <div className="grow">
                    <div className="row">
                      <b>{s.title}</b>
                      <Pill tone={s.required ? "you" : "idle"}>
                        {s.required ? "Required" : "Optional"}
                      </Pill>
                      <span className="muted" style={{ fontSize: "0.86rem" }}>
                        {scenarioKind(s.kind)} · {s.surfaceKeys.join(", ")}
                        {s.commandId ? ` · verified by ${s.commandId}` : ""}
                      </span>
                    </div>
                    <p className="muted" style={{ fontSize: "0.9rem" }}>
                      {s.expected}
                    </p>
                  </div>
                  <div className="row">
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => setEditScenario(i)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost btn-danger"
                      onClick={() =>
                        update({
                          scenarios: draft.scenarios.filter((_, j) => j !== i),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ),
          )}
          {editScenario === "new" && (
            <ScenarioEditor
              initial={blankScenario}
              isNew
              draft={draft}
              onCancel={() => setEditScenario(null)}
              onSave={(next) => {
                update({ scenarios: [...draft.scenarios, next] });
                setEditScenario(null);
              }}
            />
          )}
          {!draft.scenarios.length && editScenario === null && (
            <p className="empty-inline">No scenarios yet.</p>
          )}
        </div>
      </Section>
    </div>
  );
}
