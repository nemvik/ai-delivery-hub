"use client";
import { useState } from "react";
import type {
  Project,
  Role,
  Settings,
} from "../../../../packages/contracts/src/index";
import type { Hub } from "../../lib/hub";
import { RolePicker } from "../role-picker";
import { Banner, Field } from "../ui";
import { RepoList, type Repo } from "./repo-editor";

const STEPS = ["Name", "Repositories", "AI models"] as const;

export function NewProject({
  hub,
  settings,
  home,
  onCreated,
  onCancel,
}: {
  hub: Hub;
  settings: Settings;
  home: string | null;
  onCreated: (project: Project) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [trusted, setTrusted] = useState(false);
  const [roles, setRoles] = useState<{ implementer?: Role; reviewer?: Role }>(
    {},
  );
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const appDefaults = settings.defaultRoles ?? {};
  const canNext =
    step === 0
      ? !!name.trim()
      : step === 1
        ? repos.length > 0 && trusted
        : true;
  const create = async () => {
    setCreating(true);
    setError("");
    const defaultRoles = Object.fromEntries(
      Object.entries(roles).filter(([, v]) => v !== undefined),
    );
    const result = await hub.call<Project>("projects", {
      name: name.trim(),
      trusted: true,
      repositories: repos,
      ...(Object.keys(defaultRoles).length ? { defaultRoles } : {}),
    });
    setCreating(false);
    if (!result.ok) return setError(result.error);
    await hub.reload();
    onCreated(result.data);
  };
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">New project</h1>
          <p className="page-sub">
            A project tells the hub which repositories it may read and which
            models to use. Registering a project doesn’t run anything.
          </p>
        </div>
      </div>
      <ol className="wizard-steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={i === step ? "on" : i < step ? "done" : ""}
            aria-current={i === step ? "step" : undefined}
          >
            <span className="n">{i < step ? "✓" : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <div className="card" style={{ maxWidth: 920 }}>
        {step === 0 && (
          <Field
            label="Project name"
            help="For example the product name. You can change it later."
          >
            {(id) => (
              <input
                id={id}
                className="input"
                autoFocus
                maxLength={160}
                value={name}
                placeholder="Happenee"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && name.trim()) setStep(1);
                }}
              />
            )}
          </Field>
        )}
        {step === 1 && (
          <div className="stack">
            <div>
              <h2>Repositories</h2>
              <p className="muted">
                Add every repository a change can touch, for example the backend
                monorepo and the mobile app. Pick the folder, check it, and
                choose the branch to compare against.
              </p>
            </div>
            <RepoList repos={repos} onChange={setRepos} hub={hub} home={home} />
            <label className="check">
              <input
                type="checkbox"
                checked={trusted}
                onChange={(e) => setTrusted(e.target.checked)}
              />
              <span>
                These are my own, trusted repositories.{" "}
                <span className="muted">
                  The hub runs their approved commands on this computer. It is
                  not a sandbox for unknown code.
                </span>
              </span>
            </label>
          </div>
        )}
        {step === 2 && (
          <div className="stack">
            <div>
              <h2>AI models</h2>
              <p className="muted">
                Defaults for this project’s tasks. You can skip this and use the
                app defaults.
              </p>
            </div>
            <div className="form-grid">
              <RolePicker
                title="Implementer"
                description="Writes the change in Implement + review + QA runs."
                value={roles.implementer}
                inherited={appDefaults.implementer}
                models={settings.models}
                onChange={(implementer) => setRoles({ ...roles, implementer })}
              />
              <RolePicker
                title="Reviewer"
                description="Reads the change and reports findings. Never edits code."
                value={roles.reviewer}
                inherited={appDefaults.reviewer}
                models={settings.models}
                onChange={(reviewer) => setRoles({ ...roles, reviewer })}
              />
            </div>
          </div>
        )}
        {error && <Banner tone="bad">{error}</Banner>}
        <div
          className="spread"
          style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            onClick={step ? () => setStep(step - 1) : onCancel}
          >
            {step ? "Back" : "Cancel"}
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canNext}
              onClick={() => setStep(step + 1)}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={creating}
              onClick={() => void create()}
            >
              {creating ? "Creating…" : "Create project"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
