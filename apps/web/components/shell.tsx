"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Project } from "../../../packages/contracts/src/index";
import type { HubState } from "../lib/hub";
import type { NavState, View } from "../lib/nav";
import { Icon, ProjectAvatar, DemoTag, type AnyIcon } from "./ui";

type Theme = "system" | "light" | "dark";
function readTheme(): Theme {
  try {
    const t = window.localStorage.getItem("hub-theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}
function applyTheme(theme: Theme) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem("hub-theme", theme);
  } catch {
    /* storage unavailable */
  }
}

export function workerOnline(state: HubState) {
  return !!state.worker && Date.now() - state.worker.heartbeat < 10000;
}

function ProjectSwitcher({
  projects,
  current,
  onSelect,
  onNew,
}: {
  projects: Project[];
  current: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === "Escape"
          : !ref.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const active = projects.filter((p) => !p.archived);
  const selected = projects.find((p) => p.id === current);
  const pick = (id: string) => {
    setOpen(false);
    onSelect(id);
  };
  return (
    <div className="switcher" ref={ref}>
      <button
        className="switcher-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch project"
        onClick={() => setOpen(!open)}
      >
        {selected ? (
          <ProjectAvatar id={selected.id} name={selected.name} />
        ) : (
          <span className="avatar neutral" aria-hidden="true">
            {current === "all" ? "∗" : "+"}
          </span>
        )}
        <span className="grow">
          <b>
            {selected
              ? selected.name
              : current === "all"
                ? "All projects"
                : "No project yet"}
          </b>
          <small>
            {selected
              ? `${selected.repositories.length} ${selected.repositories.length === 1 ? "repository" : "repositories"}${selected.archived ? " · archived" : ""}`
              : current === "all"
                ? `${active.length} projects`
                : "Create one to start"}
          </small>
        </span>
        <Icon name="chevronDown" className="faint" />
      </button>
      {open && (
        <div className="switcher-menu" role="menu" aria-label="Projects">
          {active.map((p) => (
            <button
              key={p.id}
              role="menuitemradio"
              aria-checked={p.id === current}
              className="switcher-item"
              onClick={() => pick(p.id)}
            >
              <ProjectAvatar id={p.id} name={p.name} />
              <span className="grow">
                <b>{p.name}</b>
                <small>
                  {p.repositories.length}{" "}
                  {p.repositories.length === 1 ? "repository" : "repositories"}
                </small>
              </span>
              {p.demo && <DemoTag />}
              {p.id === current && <Icon name="check" className="faint" />}
            </button>
          ))}
          {active.length > 1 && (
            <button
              role="menuitemradio"
              aria-checked={current === "all"}
              className="switcher-item"
              onClick={() => pick("all")}
            >
              <span className="avatar neutral" aria-hidden="true">
                ∗
              </span>
              <span className="grow">
                <b>All projects</b>
                <small>Everything in one list</small>
              </span>
              {current === "all" && <Icon name="check" className="faint" />}
            </button>
          )}
          {active.length > 0 && <div className="switcher-sep" />}
          <button
            role="menuitem"
            className="switcher-item"
            onClick={() => {
              setOpen(false);
              onNew();
            }}
          >
            <span className="avatar neutral" aria-hidden="true">
              <Icon name="plus" />
            </span>
            <span className="grow">
              <b>New project</b>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

export function Shell({
  state,
  nav,
  setNav,
  counts,
  children,
}: {
  state: HubState;
  nav: NavState;
  setNav: (patch: Partial<NavState>) => void;
  counts: { needsYou: number; tasks: number; runs: number };
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<Theme>("system");
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setTheme(readTheme()), []);
  const online = workerOnline(state);
  const running = state.runs.filter((r) => r.state === "running").length;
  const slots = state.settings.maxActiveRuns || 2;
  const go = (patch: Partial<NavState>) => {
    setMenuOpen(false);
    setNav({ run: null, section: null, tab: "Overview", ...patch });
  };
  const current: View = nav.run ? "runs" : nav.view;
  const items: {
    view: View;
    label: string;
    icon: AnyIcon;
    count?: number;
    attention?: boolean;
  }[] = [
    {
      view: "overview",
      label: "Overview",
      icon: "home",
      count: counts.needsYou || undefined,
      attention: counts.needsYou > 0,
    },
    { view: "tasks", label: "Tasks", icon: "list", count: counts.tasks },
    { view: "runs", label: "Runs", icon: "activity", count: counts.runs },
  ];
  const projectSelected = !!nav.project && nav.project !== "all";
  const themeOptions: { value: Theme; icon: AnyIcon; label: string }[] = [
    { value: "system", icon: "monitor", label: "Match system" },
    { value: "light", icon: "sun", label: "Light" },
    { value: "dark", icon: "moon", label: "Dark" },
  ];
  return (
    <div className="app">
      <div className="mobile-bar">
        <button
          className="icon-btn"
          aria-label="Open menu"
          onClick={() => setMenuOpen(true)}
        >
          <Icon name="menu" />
        </button>
        <span className="brand">
          <span className="brand-mark">d/</span>Delivery Hub
        </span>
        <span
          className={"status-dot" + (online ? " online" : "")}
          title={online ? "Worker running" : "Worker offline"}
        />
      </div>
      <aside
        className={"sidebar" + (menuOpen ? " open" : "")}
        onClick={(e) => {
          if (e.target === e.currentTarget) setMenuOpen(false);
        }}
      >
        <div className="sidebar-inner">
          <a
            className="brand"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              go({ view: "overview" });
            }}
          >
            <span className="brand-mark">d/</span>Delivery Hub
          </a>
          {state.loaded ? (
            <ProjectSwitcher
              projects={state.projects}
              current={nav.project}
              onSelect={(id) =>
                go({
                  project: id,
                  view: nav.view === "new-project" ? "overview" : nav.view,
                })
              }
              onNew={() => go({ view: "new-project" })}
            />
          ) : (
            <div
              className="switcher-button"
              aria-hidden="true"
              style={{ minHeight: 54 }}
            />
          )}
          <nav className="nav" aria-label="Main">
            {items.map((item) => (
              <button
                key={item.view}
                className={
                  "nav-item" + (current === item.view ? " active" : "")
                }
                aria-current={current === item.view ? "page" : undefined}
                onClick={() => go({ view: item.view })}
              >
                <Icon name={item.icon} />
                {item.label}
                {item.count !== undefined && (
                  <span
                    className={
                      "nav-count" + (item.attention ? " attention" : "")
                    }
                  >
                    {item.count}
                  </span>
                )}
              </button>
            ))}
            {projectSelected && (
              <button
                className={
                  "nav-item" + (current === "project" ? " active" : "")
                }
                aria-current={current === "project" ? "page" : undefined}
                onClick={() => go({ view: "project" })}
              >
                <Icon name="folder" />
                Project settings
              </button>
            )}
          </nav>
          <div className="sidebar-foot">
            <nav className="nav" aria-label="Application">
              <button
                className={
                  "nav-item" + (current === "settings" ? " active" : "")
                }
                aria-current={current === "settings" ? "page" : undefined}
                onClick={() => go({ view: "settings" })}
              >
                <Icon name="sliders" />
                App settings
              </button>
            </nav>
            <div className="spread" style={{ padding: "0 4px 0 10px" }}>
              <span className="faint" style={{ fontSize: "0.82rem" }}>
                Appearance
              </span>
              <div className="segmented" role="group" aria-label="Appearance">
                {themeOptions.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={theme === o.value}
                    aria-label={o.label}
                    title={o.label}
                    style={{ padding: "4px 8px" }}
                    onClick={() => {
                      setTheme(o.value);
                      applyTheme(o.value);
                    }}
                  >
                    <Icon name={o.icon} />
                  </button>
                ))}
              </div>
            </div>
            {state.loaded && (
              <div
                className="worker"
                title={
                  online
                    ? "The background worker runs tasks and tests"
                    : "Start the hub with pnpm dev or pnpm start"
                }
              >
                <span className={"status-dot" + (online ? " online" : "")} />
                {online
                  ? `Worker running · ${running} of ${slots} slots busy`
                  : "Worker offline"}
              </div>
            )}
          </div>
        </div>
      </aside>
      <main className="main">
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
