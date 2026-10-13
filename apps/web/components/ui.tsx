"use client";
import { useId, useState, type ReactNode } from "react";
import type { RunState } from "../../../packages/contracts/src/index";
import { runStatus, type IconName, type Tone } from "../lib/labels";

const PATHS: Record<IconName | ExtraIcon, ReactNode> = {
  check: <polyline points="20 6 9 17 4 12" />,
  x: (
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="12.5" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </>
  ),
  dot: (
    <circle className="icon-dot" cx="12" cy="12" r="5" fill="currentColor" />
  ),
  pause: (
    <>
      <line x1="9" y1="6" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="18" />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
    </>
  ),
  zap: <polygon points="13 2 4 14 12 14 11 22 20 10 12 10 13 2" />,
  minus: <line x1="6" y1="12" x2="18" y2="12" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" />
    </>
  ),
  plus: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  chevronDown: <polyline points="6 9 12 15 18 9" />,
  chevronRight: <polyline points="9 6 15 12 9 18" />,
  chevronLeft: <polyline points="15 6 9 12 15 18" />,
  home: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  list: (
    <>
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <polyline points="3.5 6 4.5 7 6.5 5" />
      <polyline points="3.5 12 4.5 13 6.5 11" />
      <polyline points="3.5 18 4.5 19 6.5 17" />
    </>
  ),
  activity: <polyline points="22 12 18 12 15 20 9 4 6 12 2 12" />,
  folder: (
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
  ),
  sliders: (
    <>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="17" x2="20" y2="17" />
      <circle cx="9" cy="7" r="2.4" fill="var(--surface-2)" />
      <circle cx="15" cy="17" r="2.4" fill="var(--surface-2)" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.9" y1="4.9" x2="6.3" y2="6.3" />
      <line x1="17.7" y1="17.7" x2="19.1" y2="19.1" />
      <line x1="4.9" y1="19.1" x2="6.3" y2="17.7" />
      <line x1="17.7" y1="6.3" x2="19.1" y2="4.9" />
    </>
  ),
  moon: <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z" />,
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <line x1="8" y1="20" x2="16" y2="20" />
      <line x1="12" y1="16" x2="12" y2="20" />
    </>
  ),
  menu: (
    <>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <line x1="20" y1="4" x2="11" y2="13" />
      <path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </>
  ),
  branch: (
    <>
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="8" r="2" />
      <path d="M6 7v10M18 10c0 4-6 3-11.2 7.3" />
    </>
  ),
  play: <polygon points="7 5 19 12 7 19 7 5" />,
  trash: (
    <>
      <polyline points="4 7 20 7" />
      <path d="M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />
    </>
  ),
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <line x1="16" y1="16" x2="20.5" y2="20.5" />
    </>
  ),
};
type ExtraIcon =
  | "plus"
  | "chevronDown"
  | "chevronRight"
  | "chevronLeft"
  | "home"
  | "list"
  | "activity"
  | "folder"
  | "sliders"
  | "sun"
  | "moon"
  | "monitor"
  | "menu"
  | "external"
  | "branch"
  | "play"
  | "trash"
  | "edit"
  | "search";
export type AnyIcon = IconName | ExtraIcon;

export function Icon({
  name,
  className,
}: {
  name: AnyIcon;
  className?: string;
}) {
  return (
    <svg
      className={"icon" + (className ? " " + className : "")}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

export function Pill({
  tone,
  icon,
  children,
  title,
}: {
  tone: Tone;
  icon?: AnyIcon;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={`pill tone-${tone}`} title={title}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}
export function StatusPill({
  status,
}: {
  status: { label: string; icon: AnyIcon; tone: Tone };
}) {
  return (
    <Pill tone={status.tone} icon={status.icon}>
      {status.label}
    </Pill>
  );
}
export function RunPill({ state }: { state: RunState }) {
  return (
    <span className="row-status" data-state={state}>
      <StatusPill status={runStatus(state)} />
    </span>
  );
}
export function DemoTag() {
  return (
    <span
      className="pill demo"
      title="Synthetic data and a deterministic DEMO provider"
    >
      DEMO
    </span>
  );
}

export function Banner({
  tone,
  children,
  onClose,
  role,
}: {
  tone: Tone;
  children: ReactNode;
  onClose?: () => void;
  role?: "alert" | "status";
}) {
  return (
    <div className={`banner tone-${tone}`} role={role}>
      <Icon
        name={tone === "bad" ? "alert" : tone === "ok" ? "check" : "alert"}
      />
      <div className="grow">{children}</div>
      {onClose && (
        <button className="icon-btn" onClick={onClose} aria-label="Dismiss">
          <Icon name="x" />
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  actions,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Disclosure({
  summary,
  hint,
  defaultOpen,
  plain,
  children,
}: {
  summary: ReactNode;
  hint?: ReactNode;
  defaultOpen?: boolean;
  plain?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      className={"disclosure" + (plain ? " plain" : "")}
      open={defaultOpen}
    >
      <summary>
        <Icon name="chevronRight" className="chev" />
        {summary}
        {hint && <span className="hint">{hint}</span>}
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}

export function Field({
  label,
  help,
  error,
  optional,
  children,
  className,
  id: fixedId,
}: {
  label: ReactNode;
  help?: ReactNode;
  error?: string | null;
  optional?: boolean;
  children: (id: string) => ReactNode;
  className?: string;
  id?: string;
}) {
  const generated = useId();
  const id = fixedId ?? generated;
  return (
    <div className={"field" + (className ? " " + className : "")}>
      <label className="field-label" htmlFor={id}>
        {label}
        {optional && <span className="optional"> (optional)</span>}
      </label>
      {children(id)}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : (
        help && <span className="field-help">{help}</span>
      )}
    </div>
  );
}

export function Stepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  unit,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  unit?: string;
}) {
  const clamp = (v: number) =>
    Math.min(
      max,
      Math.max(min, Math.round(Math.round(v / step) * step * 100) / 100),
    );
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
      >
        −
      </button>
      <output aria-live="polite">
        {value}
        {unit ? ` ${unit}` : ""}
      </output>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + step))}
      >
        +
      </button>
    </span>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ChipInput({
  values,
  onChange,
  placeholder,
  normalize = (v) => v.trim(),
  validate,
  id,
  label,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  normalize?: (v: string) => string;
  validate?: (v: string) => string | null;
  id?: string;
  label: string;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    const v = normalize(draft);
    if (!v) return;
    const problem = validate?.(v) ?? null;
    if (problem) return setError(problem);
    if (!values.includes(v)) onChange([...values, v]);
    setDraft("");
    setError(null);
  };
  return (
    <>
      <div className="chip-input">
        {values.map((v) => (
          <span className="chip" key={v}>
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          aria-label={label}
          value={draft}
          placeholder={values.length ? "" : placeholder}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            } else if (e.key === "Backspace" && !draft && values.length)
              onChange(values.slice(0, -1));
          }}
          onBlur={add}
        />
      </div>
      {error && <span className="field-error">{error}</span>}
    </>
  );
}

function hue(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
export function ProjectAvatar({ id, name }: { id: string; name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className="avatar"
      style={{ ["--h" as string]: String(hue(id)) }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="section" id={id}>
      <div className="spread">
        <div className="section-head">
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="row">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function Diff({ text }: { text: string }) {
  return (
    <pre className="diff">
      {text.split("\n").map((line, i) => {
        const cls =
          line.startsWith("diff --git") ||
          line.startsWith("+++") ||
          line.startsWith("---")
            ? "file"
            : line.startsWith("@@")
              ? "hunk"
              : line.startsWith("+")
                ? "add"
                : line.startsWith("-")
                  ? "del"
                  : "";
        return (
          <span key={i} className={cls}>
            {line || " "}
          </span>
        );
      })}
    </pre>
  );
}
