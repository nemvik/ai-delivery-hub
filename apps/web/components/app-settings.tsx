"use client";
import { useEffect, useMemo, useState } from "react";
import type { Project, Settings } from "../../../packages/contracts/src/index";
import type { Hub, HubState, ProviderView } from "../lib/hub";
import { setLeaveGuard } from "../lib/nav";
import {
  CAPACITY_FIELDS,
  STORAGE_FIELDS,
  bytes,
  shortPath,
  timeAgo,
} from "../lib/labels";
import { RolePicker } from "./role-picker";
import {
  Banner,
  ChipInput,
  Field,
  Icon,
  Pill,
  ProjectAvatar,
  Section,
  Stepper,
} from "./ui";

const SECTIONS = [
  { key: "connections", label: "AI connections" },
  { key: "models", label: "Models" },
  { key: "defaults", label: "Default models" },
  { key: "capacity", label: "Capacity" },
  { key: "storage", label: "Storage" },
  { key: "reports", label: "Report folders" },
  { key: "linear", label: "Linear" },
  { key: "projects", label: "Archived projects" },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];
const PROVIDERS = [
  { id: "codex-cli", name: "Codex CLI", account: "Codex" },
  { id: "claude-code-cli", name: "Claude Code", account: "Claude" },
] as const;

function providerStatus(p?: ProviderView) {
  if (!p)
    return {
      tone: "idle" as const,
      label: "Not checked",
      icon: "minus" as const,
    };
  if (p.status === "ready")
    return { tone: "ok" as const, label: "Ready", icon: "check" as const };
  if (p.status === "blocked")
    return { tone: "bad" as const, label: "Problem", icon: "x" as const };
  return {
    tone: "warn" as const,
    label: "Not verified",
    icon: "alert" as const,
  };
}

function Connection({
  provider,
  profile,
  hub,
  models,
  jobs,
}: {
  provider: (typeof PROVIDERS)[number];
  profile?: ProviderView;
  hub: Hub;
  models: Settings["models"];
  jobs: HubState["jobs"];
}) {
  const [testing, setTesting] = useState(false);
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const status = providerStatus(profile);
  const known = models.filter((m) => m.provider === provider.id);
  const pending = jobs.find(
    (j) =>
      ["doctor", "test-connection"].includes(j.type) &&
      ["pending", "claimed"].includes(j.state),
  );
  return (
    <div className="card">
      <div className="spread">
        <h3>{provider.name}</h3>
        <Pill tone={status.tone} icon={status.icon}>
          {status.label}
        </Pill>
      </div>
      <dl className="kv">
        <dt>Version</dt>
        <dd>{profile?.version ?? "Unknown"}</dd>
        <dt>Signed in</dt>
        <dd>
          {profile
            ? profile.login === "available"
              ? "Yes"
              : profile.login === "missing"
                ? "No"
                : "Unknown"
            : "Unknown"}
        </dd>
        <dt>Read-only review</dt>
        <dd>
          {profile?.capabilities.verifiedReadOnlyReview
            ? "Verified"
            : "Not verified yet"}
        </dd>
        {profile?.checkedAt && (
          <>
            <dt>Last check</dt>
            <dd>{timeAgo(profile.checkedAt)}</dd>
          </>
        )}
      </dl>
      {!!profile?.problems.length && (
        <ul className="field-help" style={{ margin: 0, paddingLeft: 18 }}>
          {profile.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div className="row">
        <button
          type="button"
          className="btn btn-sm"
          disabled={hub.busy || !!pending}
          onClick={() => void hub.mutate(`providers/${provider.id}/doctor`, {})}
        >
          Check installation
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setTesting(!testing)}
          aria-expanded={testing}
        >
          Send test prompt…
        </button>
      </div>
      {testing && (
        <form
          className="stack"
          style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            void hub.mutate(`providers/${provider.id}/test-connection`, {
              provider: provider.id,
              model,
              effort: effort || null,
              timeoutSeconds: 120,
              maxTurns: null,
            });
          }}
        >
          <div className="form-grid">
            <Field label="Model">
              {(id) => (
                <>
                  <input
                    id={id}
                    className="input"
                    required
                    list={id + "-list"}
                    value={model}
                    placeholder="Exact model ID"
                    onChange={(e) => setModel(e.target.value.trim())}
                  />
                  <datalist id={id + "-list"}>
                    {known.map((m) => (
                      <option key={m.id} value={m.id} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <Field label="Effort" optional>
              {(id) => (
                <input
                  id={id}
                  className="input"
                  value={effort}
                  placeholder="Provider default"
                  onChange={(e) => setEffort(e.target.value.trim())}
                />
              )}
            </Field>
          </div>
          <p className="field-help">
            Sends one small synthetic prompt through your {provider.account}{" "}
            account and counts toward its usage. If it passes, the model is
            marked as verified and real runs may use it.
          </p>
          <div>
            <button
              className="btn btn-primary btn-sm"
              disabled={hub.busy || !!pending}
            >
              Send test prompt
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function AppSettings({
  state,
  hub,
  section,
  setSection,
  onOpenProject,
}: {
  state: HubState;
  hub: Hub;
  section: string | null;
  setSection: (s: string) => void;
  onOpenProject: (id: string) => void;
}) {
  const current: SectionKey = SECTIONS.some((s) => s.key === section)
    ? (section as SectionKey)
    : "connections";
  const [base, setBase] = useState<Settings>(() =>
    structuredClone(state.settings),
  );
  const [draft, setDraft] = useState<Settings>(() =>
    structuredClone(state.settings),
  );
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(base),
    [draft, base],
  );
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  // Pick up catalog changes from test prompts while nothing is being edited.
  useEffect(() => {
    if (!dirty && JSON.stringify(state.settings) !== JSON.stringify(base)) {
      setBase(structuredClone(state.settings));
      setDraft(structuredClone(state.settings));
    }
  }, [state.settings, dirty, base]);
  useEffect(() => {
    setLeaveGuard(
      dirty ? () => window.confirm("Discard unsaved app settings?") : null,
    );
    return () => setLeaveGuard(null);
  }, [dirty]);
  const update = (patch: Partial<Settings>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaveError("");
  };
  const save = async () => {
    setSaving(true);
    const result = await hub.call<Settings>("settings", draft);
    setSaving(false);
    if (!result.ok) return setSaveError(result.error);
    setBase(structuredClone(result.data));
    setDraft(structuredClone(result.data));
    await hub.reload();
    hub.setNotice("Settings saved.");
  };
  const [destName, setDestName] = useState("");
  const [destPath, setDestPath] = useState("");
  const archived = state.projects.filter((p: Project) => p.archived);
  const usageLimit = (draft.maxArtifactGiB || 10) * 1024 ** 3;
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">App settings</h1>
          <p className="page-sub">Shared by all projects.</p>
        </div>
      </div>
      <div className="settings-layout">
        <nav className="subnav" aria-label="App settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              aria-current={current === s.key}
              onClick={() => setSection(s.key)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="stack-lg">
          {current === "connections" && (
            <Section
              title="AI connections"
              description="The hub uses the official CLIs you are already signed in to. It never switches to an API key or a paid fallback."
            >
              <div className="conn-grid">
                {PROVIDERS.map((p) => (
                  <Connection
                    key={p.id}
                    provider={p}
                    profile={state.providers.find((x) => x.id === p.id)}
                    hub={hub}
                    models={state.settings.models ?? []}
                    jobs={state.jobs}
                  />
                ))}
              </div>
              <p className="field-help">
                Check installation reads the CLI version, its flags and whether
                you are signed in. It sends nothing to the provider. Checks wait
                until no run is active.
              </p>
              {state.jobs.length > 0 && (
                <div className="card">
                  <h3>Recent checks and imports</h3>
                  <ul className="timeline">
                    {state.jobs.slice(0, 6).map((j) => (
                      <li key={j.id}>
                        <time>{j.created_at ? timeAgo(j.created_at) : ""}</time>
                        <p>
                          {j.type === "doctor"
                            ? "Installation check"
                            : j.type === "test-connection"
                              ? "Test prompt"
                              : "Linear import"}{" "}
                          <span className="muted">
                            ·{" "}
                            {j.state === "done"
                              ? "finished"
                              : j.state === "claimed"
                                ? "running"
                                : j.state}
                          </span>
                        </p>
                      </li>
                    ))}
                  </ul>
                  {state.notices
                    .filter((n) => n.type === "error")
                    .slice(0, 2)
                    .map((n, i) => (
                      <p key={i} className="field-error">
                        {n.message}
                      </p>
                    ))}
                </div>
              )}
            </Section>
          )}
          {current === "models" && (
            <Section
              title="Models"
              description="Models the hub knows about. Real runs only use a model after it passes a test prompt in AI connections; passing one adds it here automatically."
              actions={
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() =>
                    update({
                      models: [
                        ...(draft.models ?? []),
                        {
                          provider: "codex-cli",
                          id: "",
                          effortOptions: [],
                          availability: "unverified",
                        },
                      ],
                    })
                  }
                >
                  <Icon name="plus" /> Add model
                </button>
              }
            >
              {!draft.models?.length ? (
                <p className="empty-inline">
                  No models yet. Send a test prompt in AI connections to add the
                  first one.
                </p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Provider</th>
                        <th>Model ID</th>
                        <th>Effort levels</th>
                        <th>Status</th>
                        <th aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {draft.models.map((m, i) => {
                        const set = (patch: Partial<typeof m>) =>
                          update({
                            models: draft.models.map((x, j) =>
                              j === i ? { ...x, ...patch } : x,
                            ),
                          });
                        return (
                          <tr key={i}>
                            <td>
                              <select
                                className="select"
                                aria-label="Provider"
                                value={m.provider}
                                onChange={(e) =>
                                  set({
                                    provider: e.target
                                      .value as typeof m.provider,
                                  })
                                }
                              >
                                <option value="codex-cli">Codex</option>
                                <option value="claude-code-cli">
                                  Claude Code
                                </option>
                              </select>
                            </td>
                            <td>
                              <input
                                className="input"
                                aria-label="Model ID"
                                value={m.id}
                                onChange={(e) =>
                                  set({ id: e.target.value.trim() })
                                }
                              />
                            </td>
                            <td style={{ minWidth: 200 }}>
                              <ChipInput
                                label="Effort levels"
                                values={m.effortOptions}
                                onChange={(effortOptions) =>
                                  set({ effortOptions })
                                }
                                placeholder="high"
                              />
                            </td>
                            <td>
                              <Pill
                                tone={
                                  m.availability === "verified"
                                    ? "ok"
                                    : m.availability === "unavailable"
                                      ? "bad"
                                      : "warn"
                                }
                                icon={
                                  m.availability === "verified"
                                    ? "check"
                                    : "alert"
                                }
                              >
                                {m.availability === "verified"
                                  ? "Verified"
                                  : m.availability === "unavailable"
                                    ? "Unavailable"
                                    : "Not verified"}
                              </Pill>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="icon-btn"
                                aria-label={`Remove ${m.id || "model"}`}
                                onClick={() =>
                                  update({
                                    models: draft.models.filter(
                                      (_, j) => j !== i,
                                    ),
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
              )}
              <p className="field-help">
                Changing a model’s ID or effort levels marks it as not verified
                again.
              </p>
            </Section>
          )}
          {current === "defaults" && (
            <Section
              title="Default models"
              description="Used by projects that don’t set their own. Each project and task can override them."
            >
              <div className="form-grid">
                <RolePicker
                  title="Implementer"
                  description="Writes the change in Implement + review + QA runs."
                  value={draft.defaultRoles?.implementer}
                  models={draft.models ?? []}
                  onChange={(implementer) =>
                    update({
                      defaultRoles: { ...draft.defaultRoles, implementer },
                    })
                  }
                />
                <RolePicker
                  title="Reviewer"
                  description="Reads the change and reports findings. Never edits code."
                  value={draft.defaultRoles?.reviewer}
                  models={draft.models ?? []}
                  onChange={(reviewer) =>
                    update({
                      defaultRoles: { ...draft.defaultRoles, reviewer },
                    })
                  }
                />
              </div>
            </Section>
          )}
          {current === "capacity" && (
            <Section
              title="Capacity"
              description="How much the hub does at once on this computer. Lower numbers are slower but safer for memory and shared test data."
            >
              <div className="card">
                {CAPACITY_FIELDS.map((f) => (
                  <div className="cap-row" key={f.key}>
                    <div>
                      <b>{f.label}</b>
                      <small>{f.help}</small>
                    </div>
                    <Stepper
                      label={f.label}
                      value={Number(draft[f.key] ?? f.min)}
                      min={f.min}
                      max={f.max}
                      onChange={(v) =>
                        update({ [f.key]: v } as Partial<Settings>)
                      }
                    />
                  </div>
                ))}
              </div>
            </Section>
          )}
          {current === "storage" && (
            <>
              <Section
                title="Storage"
                description="Screenshots, traces and reports kept on this computer."
              >
                <div className="card">
                  <div className="spread">
                    <b>{bytes(state.disk.bytes)} used</b>
                    <span className="muted">of {draft.maxArtifactGiB} GB</span>
                  </div>
                  <div className="usage" aria-hidden="true">
                    <span
                      style={{
                        width: `${Math.min(100, (state.disk.bytes / usageLimit) * 100)}%`,
                      }}
                    />
                  </div>
                  {STORAGE_FIELDS.map((f) => (
                    <div className="cap-row" key={f.key}>
                      <div>
                        <b>{f.label}</b>
                        <small>{f.help}</small>
                      </div>
                      <Stepper
                        label={f.label}
                        value={Number(draft[f.key] ?? f.min)}
                        min={f.min}
                        max={f.max}
                        step={f.step}
                        unit={f.unit}
                        onChange={(v) =>
                          update({ [f.key]: v } as Partial<Settings>)
                        }
                      />
                    </div>
                  ))}
                </div>
              </Section>
              <Section
                title="Ready to clean up"
                description="Archived, approved runs older than the retention period. Cleanup deletes only their evidence files; published copies and source code stay."
              >
                {!state.disk.retention.length ? (
                  <p className="empty-inline">Nothing to clean up.</p>
                ) : (
                  <div className="list">
                    {state.disk.retention.map((r) => {
                      const run = state.runs.find((x) => x.id === r.runId);
                      return (
                        <div
                          className="list-row"
                          key={r.runId}
                          style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}
                        >
                          <span>
                            <span className="row-title">
                              {run?.config.task.title ?? r.runId}
                            </span>
                            <span className="row-meta">{bytes(r.bytes)}</span>
                          </span>
                          <button
                            className="btn btn-sm btn-danger"
                            disabled={hub.busy}
                            onClick={() =>
                              void hub.mutate(`runs/${r.runId}/actions`, {
                                action: "cleanup-evidence",
                              })
                            }
                          >
                            Delete evidence
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>
            </>
          )}
          {current === "reports" && (
            <Section
              title="Report folders"
              description="Approved folders the hub may copy evidence packs into, for example a synced drive. Publishing is always a separate action on a run."
            >
              {state.destinations.length > 0 && (
                <div className="list">
                  {state.destinations.map((d) => (
                    <div
                      className="list-row"
                      key={d.id}
                      style={{ gridTemplateColumns: "minmax(0,1fr)" }}
                    >
                      <span>
                        <span className="row-title">{d.name}</span>
                        <span className="path">
                          {shortPath(d.path, state.home)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <form
                className="card"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const ok = await hub.mutate("destinations", {
                    name: destName,
                    path: destPath,
                  });
                  if (ok) {
                    setDestName("");
                    setDestPath("");
                    hub.setNotice("Report folder approved.");
                  }
                }}
              >
                <h3>Add a report folder</h3>
                <div className="form-grid">
                  <Field label="Name">
                    {(id) => (
                      <input
                        id={id}
                        className="input"
                        required
                        value={destName}
                        placeholder="Team drive"
                        onChange={(e) => setDestName(e.target.value)}
                      />
                    )}
                  </Field>
                  <Field
                    label="Folder"
                    help="Must already exist, outside the repositories and the hub’s own data."
                  >
                    {(id) => (
                      <input
                        id={id}
                        className="input mono"
                        required
                        value={destPath}
                        placeholder="/absolute/path/to/reports"
                        onChange={(e) => setDestPath(e.target.value)}
                      />
                    )}
                  </Field>
                </div>
                <div>
                  <button className="btn" disabled={hub.busy}>
                    Approve folder
                  </button>
                </div>
              </form>
              <p className="field-help">
                An internal hub API isn’t configured. No endpoint is assumed.
              </p>
            </Section>
          )}
          {current === "linear" && (
            <Section
              title="Linear"
              description="Import a single issue as a task from the New task dialog. The hub only reads Linear; it never starts runs or writes back."
            >
              <div className="card">
                <div className="spread">
                  <b>Access token</b>
                  {state.linearConfigured ? (
                    <Pill tone="ok" icon="check">
                      Set
                    </Pill>
                  ) : (
                    <Pill tone="idle" icon="minus">
                      Not set
                    </Pill>
                  )}
                </div>
                <p className="muted">
                  Set <code>HUB_LINEAR_TOKEN</code> in the environment of the
                  hub process and restart it. The token is never shown in the
                  browser or passed to AI agents.
                </p>
              </div>
            </Section>
          )}
          {current === "projects" && (
            <Section
              title="Archived projects"
              description="Hidden from the project switcher. Their runs and evidence are kept."
            >
              {!archived.length ? (
                <p className="empty-inline">No archived projects.</p>
              ) : (
                <div className="list">
                  {archived.map((p) => (
                    <div
                      className="list-row"
                      key={p.id}
                      style={{ gridTemplateColumns: "auto minmax(0,1fr) auto" }}
                    >
                      <ProjectAvatar id={p.id} name={p.name} />
                      <span>
                        <span className="row-title">{p.name}</span>
                        <span className="row-meta">
                          {p.repositories.map((r) => r.key).join(", ")}
                        </span>
                      </span>
                      <span className="row-side">
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => onOpenProject(p.id)}
                        >
                          Open
                        </button>
                        <button
                          className="btn btn-sm"
                          disabled={hub.busy}
                          onClick={async () => {
                            const ok = await hub.mutate(
                              `projects/${p.id}/archive`,
                              { archived: false },
                            );
                            if (ok) hub.setNotice(`“${p.name}” restored.`);
                          }}
                        >
                          Restore
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}
          {(dirty || saveError) && (
            <div className="savebar" role="region" aria-label="Unsaved changes">
              <div className="grow">
                <b>Unsaved changes.</b> They apply to runs started after you
                save.
                {saveError && <span className="field-error">{saveError}</span>}
              </div>
              <div className="row">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setDraft(structuredClone(base));
                    setSaveError("");
                  }}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={saving}
                  onClick={() => void save()}
                >
                  {saving ? "Saving…" : "Save settings"}
                </button>
              </div>
            </div>
          )}
          {!state.worker && (
            <Banner tone="warn">
              The worker isn’t running, so checks and imports wait until it
              starts.
            </Banner>
          )}
        </div>
      </div>
    </>
  );
}
