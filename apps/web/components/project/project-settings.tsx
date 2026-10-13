"use client";
import { useEffect, useMemo, useState } from "react";
import type {
  Project,
  Settings,
} from "../../../../packages/contracts/src/index";
import type { Hub } from "../../lib/hub";
import { setLeaveGuard } from "../../lib/nav";
import { SKILL_TRIGGERS } from "../../lib/labels";
import { RolePicker } from "../role-picker";
import { Banner, DemoTag, Field, Icon, Section } from "../ui";
import { RepoList } from "./repo-editor";
import { TestsSection } from "./tests-section";

export type ProjectDraft = Omit<Project, "id" | "createdAt" | "archived">;
export function toDraft(project: Project): ProjectDraft {
  const {
    id: _id,
    createdAt: _createdAt,
    archived: _archived,
    ...draft
  } = project;
  void _id;
  void _createdAt;
  void _archived;
  return structuredClone(draft);
}

const SECTIONS = [
  { key: "general", label: "General" },
  { key: "repositories", label: "Repositories" },
  { key: "models", label: "AI models" },
  { key: "tests", label: "Tests" },
  { key: "advanced", label: "Advanced" },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];

const ADVANCED_KEYS = [
  "runtime",
  "native",
  "reviewSkills",
  "reviewContext",
  "exclusiveResources",
  "requiredTestPaths",
  "onboardingNotes",
] as const;
function advancedText(draft: ProjectDraft) {
  return JSON.stringify(
    Object.fromEntries(ADVANCED_KEYS.map((k) => [k, draft[k] ?? null])),
    null,
    2,
  );
}

function AdvancedSection({
  draft,
  update,
  onError,
}: {
  draft: ProjectDraft;
  update: (p: Partial<ProjectDraft>) => void;
  onError: (e: string) => void;
}) {
  const [text, setText] = useState(() => advancedText(draft));
  const [error, setError] = useState("");
  return (
    <Section
      title="Advanced"
      description="Rarely changed settings, edited as JSON: runtime services for QA, the native (Maestro) setup, review skills and context with their SHA-256 hashes, exclusive resources, required test files and onboarding notes. The server validates everything when you save."
    >
      <Field
        label="Advanced settings (JSON)"
        error={error || null}
        help="Use null to leave runtime or native unset."
      >
        {(id) => (
          <textarea
            id={id}
            className="textarea mono"
            rows={22}
            spellCheck={false}
            aria-invalid={!!error}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              try {
                const value = JSON.parse(e.target.value) as Record<
                  string,
                  unknown
                >;
                if (!value || typeof value !== "object" || Array.isArray(value))
                  throw new Error("Expected a JSON object");
                const unknown = Object.keys(value).filter(
                  (k) => !(ADVANCED_KEYS as readonly string[]).includes(k),
                );
                if (unknown.length)
                  throw new Error(`Unknown keys: ${unknown.join(", ")}`);
                update(
                  Object.fromEntries(
                    ADVANCED_KEYS.map((k) => [
                      k,
                      value[k] === null || value[k] === undefined
                        ? ["runtime", "native"].includes(k)
                          ? undefined
                          : []
                        : value[k],
                    ]),
                  ) as Partial<ProjectDraft>,
                );
                setError("");
                onError("");
              } catch (err) {
                const message = (err as Error).message;
                setError(message);
                onError("Fix the JSON in Advanced before saving.");
              }
            }}
          />
        )}
      </Field>
    </Section>
  );
}

export function ProjectSettings({
  project,
  hub,
  settings,
  home,
  section,
  setSection,
  onArchived,
  intro,
}: {
  project: Project;
  hub: Hub;
  settings: Settings;
  home: string | null;
  section: string | null;
  setSection: (s: string) => void;
  onArchived: () => void;
  intro?: string;
}) {
  const [base, setBase] = useState(() => toDraft(project));
  const [draft, setDraft] = useState(() => toDraft(project));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [advancedError, setAdvancedError] = useState("");
  const [version, setVersion] = useState(0);
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(base),
    [draft, base],
  );
  const current: SectionKey = SECTIONS.some((s) => s.key === section)
    ? (section as SectionKey)
    : "general";
  const update = (patch: Partial<ProjectDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaveError("");
  };
  useEffect(() => {
    setLeaveGuard(
      dirty
        ? () => window.confirm("Discard unsaved changes to this project?")
        : null,
    );
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      setLeaveGuard(null);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [dirty]);
  const save = async () => {
    setSaving(true);
    const result = await hub.call<Project>(`projects/${project.id}`, draft);
    setSaving(false);
    if (!result.ok) return setSaveError(result.error);
    const next = toDraft(result.data);
    setBase(next);
    setDraft(next);
    setVersion((v) => v + 1);
    await hub.reload();
    hub.setNotice(
      "Project saved. New runs use these settings; earlier runs keep theirs.",
    );
  };
  const archive = async (archived: boolean) => {
    const result = await hub.call<Project>(`projects/${project.id}/archive`, {
      archived,
    });
    if (!result.ok) return hub.setError(result.error);
    await hub.reload();
    hub.setNotice(
      archived
        ? `“${project.name}” archived. Its runs and evidence are kept.`
        : `“${project.name}” restored.`,
    );
    if (archived) onArchived();
  };
  const appDefaults = settings.defaultRoles ?? {};
  return (
    <>
      <div className="page-head">
        <div>
          <div className="row">
            <h1 className="page-title">Project settings</h1>
            {project.demo && <DemoTag />}
          </div>
          <p className="page-sub">{project.name}</p>
        </div>
      </div>
      {intro && <Banner tone="ok">{intro}</Banner>}
      {project.archived && (
        <Banner tone="warn">
          This project is archived. It is hidden from the project list and can’t
          get new tasks.{" "}
          <button className="link-btn" onClick={() => void archive(false)}>
            Restore project
          </button>
        </Banner>
      )}
      <div className="settings-layout">
        <nav className="subnav" aria-label="Project settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              aria-current={current === s.key}
              onClick={() => setSection(s.key)}
            >
              {s.label}
              {s.key === "advanced" && advancedError && (
                <span className="dot-mark" aria-label="has errors" />
              )}
            </button>
          ))}
        </nav>
        <div className="stack-lg">
          {current === "general" && (
            <>
              <Section title="General">
                <Field
                  label="Project name"
                  help="Shown in the project switcher and in reports."
                >
                  {(id) => (
                    <input
                      id={id}
                      className="input"
                      style={{ maxWidth: 480 }}
                      value={draft.name}
                      maxLength={160}
                      onChange={(e) => update({ name: e.target.value })}
                    />
                  )}
                </Field>
              </Section>
              <Section
                title="What the implementing agent may do"
                description="Applies only to Implement + review + QA runs. Reviewers never get these permissions."
              >
                <div>
                  <label className="switch-row">
                    <span>
                      <b>Allow network access</b>
                      <small>
                        Off unless the agent must download something to do its
                        work.
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      className="toggle"
                      checked={draft.allowNetwork}
                      onChange={(e) =>
                        update({ allowNetwork: e.target.checked })
                      }
                    />
                  </label>
                  <label className="switch-row">
                    <span>
                      <b>Allow package installs</b>
                      <small>
                        Lets the agent add dependencies to the run’s own copy of
                        the code.
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      className="toggle"
                      checked={draft.allowInstall}
                      onChange={(e) =>
                        update({ allowInstall: e.target.checked })
                      }
                    />
                  </label>
                </div>
              </Section>
              {!!draft.onboardingNotes.length && (
                <Section title="Still to set up">
                  <ul className="notes" style={{ margin: 0, paddingLeft: 18 }}>
                    {draft.onboardingNotes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </Section>
              )}
              {!project.archived && (
                <Section
                  title="Archive project"
                  description="Hides the project from the switcher and stops new tasks. Runs, reports and evidence stay. You can restore it from App settings."
                >
                  <div>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => void archive(true)}
                    >
                      Archive project
                    </button>
                  </div>
                </Section>
              )}
            </>
          )}
          {current === "repositories" && (
            <Section
              title="Repositories"
              description="The hub works on its own copies of these repositories. Your checkout is never changed, and only committed work is used."
            >
              <RepoList
                key={version}
                repos={draft.repositories}
                onChange={(repositories) => update({ repositories })}
                hub={hub}
                home={home}
              />
            </Section>
          )}
          {current === "models" && (
            <Section
              title="AI models"
              description="Defaults for new tasks in this project. Each task can still pick something else."
            >
              <div className="form-grid">
                <RolePicker
                  title="Implementer"
                  description="Writes the change in Implement + review + QA runs."
                  value={draft.defaultRoles?.implementer}
                  inherited={appDefaults.implementer ?? undefined}
                  models={settings.models}
                  allowDemo={draft.demo}
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
                  inherited={appDefaults.reviewer ?? undefined}
                  models={settings.models}
                  allowDemo={draft.demo}
                  onChange={(reviewer) =>
                    update({
                      defaultRoles: { ...draft.defaultRoles, reviewer },
                    })
                  }
                />
              </div>
              {draft.reviewSkills.length > 0 && (
                <div className="card">
                  <div className="spread">
                    <h3>
                      Automatic review skills ({draft.reviewSkills.length})
                    </h3>
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => setSection("advanced")}
                    >
                      Edit in Advanced
                    </button>
                  </div>
                  <p className="muted">
                    Extra review guidance added after Start when the trigger
                    matches. Their content is frozen per run; they add no
                    permissions and publish nothing.
                  </p>
                  <ul className="checklist">
                    {draft.reviewSkills.map((skill) => (
                      <li key={skill.id}>
                        <span>
                          <b>{skill.title}</b>
                          <small>
                            {SKILL_TRIGGERS[skill.trigger] ?? skill.trigger} ·{" "}
                            {skill.repoKeys.join(", ")}
                          </small>
                        </span>
                        <span className="faint" style={{ fontSize: "0.85rem" }}>
                          {skill.sources.length}{" "}
                          {skill.sources.length === 1 ? "source" : "sources"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!appDefaults.implementer && !appDefaults.reviewer && (
                <p className="field-help">
                  <Icon name="alert" /> App-wide default models aren’t set yet.
                  You can set them in App settings → Default models.
                </p>
              )}
            </Section>
          )}
          {current === "tests" && (
            <TestsSection key={version} draft={draft} update={update} />
          )}
          {current === "advanced" && (
            <AdvancedSection
              key={version}
              draft={draft}
              update={update}
              onError={setAdvancedError}
            />
          )}
          {(dirty || saveError) && (
            <div className="savebar" role="region" aria-label="Unsaved changes">
              <div className="grow">
                <b>Unsaved changes.</b> Runs that already started keep their own
                copy of the settings.
                {(saveError || advancedError) && (
                  <span className="field-error">
                    {saveError || advancedError}
                  </span>
                )}
              </div>
              <div className="row">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setDraft(structuredClone(base));
                    setSaveError("");
                    setAdvancedError("");
                    setVersion((v) => v + 1);
                  }}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={saving || !!advancedError || !draft.name.trim()}
                  onClick={() => void save()}
                >
                  {saving ? "Saving…" : "Save project"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
