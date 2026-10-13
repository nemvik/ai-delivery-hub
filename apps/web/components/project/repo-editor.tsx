"use client";
import { useId, useState } from "react";
import type {
  Project,
  RepositoryInspection,
} from "../../../../packages/contracts/src/index";
import type { Hub } from "../../lib/hub";
import { shortPath } from "../../lib/labels";
import { ChipInput, Field, Icon } from "../ui";

export type Repo = Project["repositories"][number];
const KEY = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const PREFERRED_BASE = [
  "main",
  "master",
  "origin/main",
  "origin/master",
  "develop",
  "origin/develop",
];

export function RepoEditor({
  initial,
  takenKeys,
  hub,
  home,
  onSave,
  onCancel,
  saveLabel,
}: {
  initial?: Repo;
  takenKeys: string[];
  hub: Hub;
  home: string | null;
  onSave: (repo: Repo) => void;
  onCancel?: () => void;
  saveLabel: string;
}) {
  const listId = useId();
  const [path, setPath] = useState(
    initial ? shortPath(initial.sourcePath, home) : "",
  );
  const [key, setKey] = useState(initial?.key ?? "");
  const [baseline, setBaseline] = useState(initial?.baselineRef ?? "");
  const [prefixes, setPrefixes] = useState<string[]>(
    initial?.issuePrefixes ?? [],
  );
  const [inspection, setInspection] = useState<RepositoryInspection | null>(
    null,
  );
  const [checkError, setCheckError] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const unchangedPath =
    !!initial &&
    (path === initial.sourcePath ||
      path === shortPath(initial.sourcePath, home));
  const check = async () => {
    if (!path.trim()) return;
    setChecking(true);
    setCheckError("");
    const result = await hub.call<RepositoryInspection>(
      "repositories/inspect",
      { path: path.trim() },
    );
    setChecking(false);
    if (!result.ok) {
      setInspection(null);
      setCheckError(result.error);
      return;
    }
    const info = result.data;
    setInspection(info);
    setPath(shortPath(info.path, home));
    if (!key) setKey(info.suggestedKey);
    if (!baseline)
      setBaseline(
        PREFERRED_BASE.find((b) => info.branches.includes(b)) ??
          info.currentBranch ??
          "",
      );
  };
  const save = () => {
    if (!KEY.test(key))
      return setError(
        "Use letters, numbers, - or _ for the name, starting with a letter or number.",
      );
    if (takenKeys.includes(key))
      return setError(`Another repository is already called “${key}”.`);
    if (!baseline.trim())
      return setError("Choose the branch to compare against.");
    if (!unchangedPath && !inspection)
      return setError("Check the folder first.");
    const sourcePath = inspection?.path ?? initial!.sourcePath;
    onSave({
      key,
      sourcePath,
      ...(unchangedPath && initial?.sourceIdentity
        ? { sourceIdentity: initial.sourceIdentity }
        : {}),
      baselineRef: baseline.trim(),
      issuePrefixes: prefixes,
    });
  };
  return (
    <div className="item-card editing">
      <Field
        label="Folder on this computer"
        help="The repository root. The hub makes its own copy and never changes your checkout."
      >
        {(id) => (
          <div className="input-row">
            <input
              id={id}
              className="input mono"
              value={path}
              placeholder="~/Projects/my-app"
              onChange={(e) => {
                setPath(e.target.value);
                setInspection(null);
                setCheckError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void check();
                }
              }}
            />
            <button
              type="button"
              className="btn"
              disabled={checking || !path.trim()}
              onClick={() => void check()}
            >
              {checking ? "Checking…" : "Check"}
            </button>
          </div>
        )}
      </Field>
      {checkError && (
        <div className="inspect bad" role="alert">
          {checkError}
        </div>
      )}
      {inspection && (
        <div className="inspect ok" role="status">
          <span className="ok-line">
            <Icon name="check" /> Git repository found
          </span>
          <span>
            Current branch <b>{inspection.currentBranch ?? "detached"}</b> ·{" "}
            {inspection.branches.length}{" "}
            {inspection.branches.length === 1 ? "branch" : "branches"}
          </span>
          <span className="muted">
            Only committed work is used in runs. Uncommitted changes stay in
            your checkout.
          </span>
        </div>
      )}
      <div className="form-grid three">
        <Field label="Name" help="Short ID used in tasks and reports.">
          {(id) => (
            <input
              id={id}
              className="input"
              value={key}
              onChange={(e) => setKey(e.target.value.trim())}
            />
          )}
        </Field>
        <Field
          label="Compare against"
          help="Branch that changes are measured against."
        >
          {(id) => (
            <>
              <input
                id={id}
                className="input"
                list={listId}
                value={baseline}
                placeholder="main"
                onChange={(e) => setBaseline(e.target.value)}
              />
              <datalist id={listId}>
                {inspection?.branches.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field
          label="Linear prefixes"
          optional
          help="Links issues like MOB-218 to this repository."
        >
          {(id) => (
            <ChipInput
              id={id}
              label="Linear prefixes"
              values={prefixes}
              onChange={setPrefixes}
              placeholder="MOB"
              normalize={(v) => v.trim().toUpperCase().replace(/-$/, "")}
              validate={(v) =>
                /^[A-Z][A-Z0-9]{0,19}$/.test(v)
                  ? null
                  : "Use capital letters and digits, e.g. MOB."
              }
            />
          )}
        </Field>
      </div>
      {error && <span className="field-error">{error}</span>}
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={save}>
          {saveLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

export function RepoCard({
  repo,
  home,
  onEdit,
  onRemove,
}: {
  repo: Repo;
  home: string | null;
  onEdit: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="item-card">
      <div className="item-head">
        <div className="grow">
          <b>{repo.key}</b>
          <div className="path">{shortPath(repo.sourcePath, home)}</div>
        </div>
        <div className="row">
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={onEdit}
          >
            Edit
          </button>
          {onRemove && (
            <button
              type="button"
              className="btn btn-sm btn-ghost btn-danger"
              onClick={onRemove}
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <div className="chips">
        <span className="chip">
          <Icon name="branch" /> Compare against {repo.baselineRef}
        </span>
        {repo.issuePrefixes.map((p) => (
          <span className="chip" key={p}>
            Linear {p}
          </span>
        ))}
      </div>
    </div>
  );
}

export function RepoList({
  repos,
  onChange,
  hub,
  home,
}: {
  repos: Repo[];
  onChange: (repos: Repo[]) => void;
  hub: Hub;
  home: string | null;
}) {
  const [editing, setEditing] = useState<number | "new" | null>(
    repos.length ? null : "new",
  );
  return (
    <div className="stack">
      {repos.map((r, i) =>
        editing === i ? (
          <RepoEditor
            key={r.key}
            initial={r}
            hub={hub}
            home={home}
            takenKeys={repos.filter((_, j) => j !== i).map((x) => x.key)}
            saveLabel="Done"
            onCancel={() => setEditing(null)}
            onSave={(repo) => {
              onChange(repos.map((x, j) => (j === i ? repo : x)));
              setEditing(null);
            }}
          />
        ) : (
          <RepoCard
            key={r.key}
            repo={r}
            home={home}
            onEdit={() => setEditing(i)}
            onRemove={
              repos.length > 1
                ? () => onChange(repos.filter((_, j) => j !== i))
                : undefined
            }
          />
        ),
      )}
      {editing === "new" ? (
        <RepoEditor
          hub={hub}
          home={home}
          takenKeys={repos.map((r) => r.key)}
          saveLabel="Add repository"
          onCancel={repos.length ? () => setEditing(null) : undefined}
          onSave={(repo) => {
            onChange([...repos, repo]);
            setEditing(null);
          }}
        />
      ) : (
        <div>
          <button
            type="button"
            className="btn"
            onClick={() => setEditing("new")}
          >
            <Icon name="plus" /> Add repository
          </button>
        </div>
      )}
    </div>
  );
}
