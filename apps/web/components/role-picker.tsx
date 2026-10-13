"use client";
import { useId } from "react";
import type { Role, Settings } from "../../../packages/contracts/src/index";
import { PROVIDER_LABELS } from "../lib/labels";
import { Field, Pill, Segmented, Stepper } from "./ui";

export const DEFAULT_ROLE: Record<"implementer" | "reviewer", Role> = {
  implementer: {
    provider: "codex-cli",
    model: "",
    effort: null,
    timeoutSeconds: 1800,
    maxTurns: null,
  },
  reviewer: {
    provider: "claude-code-cli",
    model: "",
    effort: null,
    timeoutSeconds: 1800,
    maxTurns: null,
  },
};

export function roleSummary(role?: Role | null) {
  if (!role || !role.model) return "Not set";
  return [
    PROVIDER_LABELS[role.provider],
    role.model,
    role.effort && `${role.effort} effort`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function modelStatus(
  role: Role | undefined,
  models: Settings["models"],
) {
  if (!role || role.provider === "fake") return null;
  const entry = models?.find(
    (m) => m.provider === role.provider && m.id === role.model,
  );
  if (
    entry?.availability === "verified" &&
    (!role.effort || entry.effortOptions.includes(role.effort))
  )
    return { tone: "ok" as const, label: "Verified" };
  if (entry?.availability === "unavailable")
    return { tone: "bad" as const, label: "Unavailable" };
  return { tone: "warn" as const, label: "Not verified yet" };
}

export function RolePicker({
  title,
  description,
  value,
  onChange,
  models,
  allowDemo,
  inherited,
  inheritedLabel = "app default",
}: {
  title: string;
  description: string;
  value: Role | undefined;
  onChange: (role: Role | undefined) => void;
  models: Settings["models"];
  allowDemo?: boolean;
  /** When set, the role can fall back to this value instead of its own. */
  inherited?: Role;
  inheritedLabel?: string;
}) {
  const listId = useId();
  const usingDefault = value === undefined && inherited !== undefined;
  const role =
    value ??
    inherited ??
    DEFAULT_ROLE[
      title.toLowerCase() === "implementer" ? "implementer" : "reviewer"
    ];
  const catalog = (models ?? []).filter((m) => m.provider === role.provider);
  const entry = catalog.find((m) => m.id === role.model);
  const status = modelStatus(role, models ?? []);
  const set = (patch: Partial<Role>) => onChange({ ...role, ...patch });
  const providers: { value: Role["provider"]; label: string }[] = [
    { value: "codex-cli", label: "Codex" },
    { value: "claude-code-cli", label: "Claude Code" },
    ...(allowDemo ? [{ value: "fake" as const, label: "DEMO" }] : []),
  ];
  return (
    <div className="role-card">
      <div className="spread">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        {status && role.model && (
          <Pill
            tone={status.tone}
            icon={status.tone === "ok" ? "check" : "alert"}
          >
            {status.label}
          </Pill>
        )}
      </div>
      {inherited !== undefined && (
        <label className="check">
          <input
            type="checkbox"
            checked={usingDefault}
            onChange={(e) =>
              onChange(e.target.checked ? undefined : { ...role })
            }
          />
          <span>
            Use the {inheritedLabel}
            <span className="muted"> ({roleSummary(inherited)})</span>
          </span>
        </label>
      )}
      {!usingDefault && (
        <>
          <Segmented
            label={`${title} provider`}
            options={providers}
            value={role.provider}
            onChange={(provider) =>
              set({
                provider,
                model:
                  provider === "fake"
                    ? "demo-deterministic"
                    : provider === role.provider
                      ? role.model
                      : "",
                effort: null,
              })
            }
          />
          <div className="form-grid">
            <Field
              label="Model"
              help={
                role.provider === "fake"
                  ? "Deterministic DEMO responses. Only allowed in the demo project."
                  : status?.tone === "ok"
                    ? "This model passed a test prompt with your CLI account."
                    : "Runs with this model are blocked until it passes a test prompt in App settings → AI connections."
              }
            >
              {(id) => (
                <>
                  <input
                    id={id}
                    className="input"
                    list={listId}
                    value={role.model}
                    disabled={role.provider === "fake"}
                    placeholder="Exact model ID, e.g. from your CLI"
                    aria-label={`${title} model`}
                    onChange={(e) =>
                      set({ model: e.target.value.trim(), effort: null })
                    }
                  />
                  <datalist id={listId}>
                    {catalog.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.availability === "verified"
                          ? "Verified"
                          : "Not verified"}
                      </option>
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <Field
              label="Effort"
              help="Leave on default unless you know the CLI accepts the value."
              optional
            >
              {(id) =>
                entry?.effortOptions.length ? (
                  <select
                    id={id}
                    className="select"
                    aria-label={`${title} effort`}
                    value={role.effort ?? ""}
                    onChange={(e) => set({ effort: e.target.value || null })}
                  >
                    <option value="">Provider default</option>
                    {entry.effortOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={id}
                    className="input"
                    aria-label={`${title} effort`}
                    value={role.effort ?? ""}
                    disabled={role.provider === "fake"}
                    placeholder="Provider default"
                    onChange={(e) =>
                      set({ effort: e.target.value.trim() || null })
                    }
                  />
                )
              }
            </Field>
          </div>
          <div className="cap-row" style={{ paddingTop: 4 }}>
            <div>
              <b>Time limit</b>
              <small>The process is stopped after this long.</small>
            </div>
            <Stepper
              label={`${title} time limit`}
              value={Math.round(role.timeoutSeconds / 60)}
              min={1}
              max={120}
              step={5}
              unit="min"
              onChange={(m) => set({ timeoutSeconds: Math.max(60, m * 60) })}
            />
          </div>
        </>
      )}
    </div>
  );
}
