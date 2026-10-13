"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Project, Run } from "../../../packages/contracts/src/index";

export const VIEWS = [
  "overview",
  "tasks",
  "runs",
  "project",
  "settings",
  "new-project",
] as const;
export type View = (typeof VIEWS)[number];
export const RUN_TABS = [
  "Overview",
  "Changes",
  "Review",
  "Tests",
  "Evidence",
  "Logs",
] as const;
export type RunTab = (typeof RUN_TABS)[number];
export interface NavState {
  project: string | null;
  view: View;
  run: string | null;
  tab: RunTab;
  section: string | null;
}
export const DEFAULT_NAV: NavState = {
  project: null,
  view: "overview",
  run: null,
  tab: "Overview",
  section: null,
};
const safe = (value: string | null) =>
  value && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : null;

export function parseNav(search: string): NavState {
  const q = new URLSearchParams(search);
  const view = q.get("view") as View | null;
  const tab = q.get("tab") as RunTab | null;
  return {
    project: safe(q.get("project")),
    view: view && VIEWS.includes(view) ? view : "overview",
    run: safe(q.get("run")),
    tab: tab && RUN_TABS.includes(tab) ? tab : "Overview",
    section: safe(q.get("section")),
  };
}

export function serializeNav(nav: NavState) {
  const q = new URLSearchParams();
  if (nav.project) q.set("project", nav.project);
  if (nav.view !== "overview") q.set("view", nav.view);
  if (nav.run) q.set("run", nav.run);
  if (nav.tab !== "Overview") q.set("tab", nav.tab);
  if (nav.section) q.set("section", nav.section);
  const s = q.toString();
  return s ? "?" + s : "";
}

/** Replaces links to things that no longer exist with sensible defaults. */
export function resolveNav(
  nav: NavState,
  projects: Pick<Project, "id" | "archived">[],
  runs: Pick<Run, "id">[],
  remembered: string | null,
): NavState {
  const active = projects.filter((p) => !p.archived);
  let project: string | null;
  if (nav.project === "all") project = "all";
  else if (nav.project && projects.some((p) => p.id === nav.project))
    project = nav.project;
  else if (remembered && active.some((p) => p.id === remembered))
    project = remembered;
  else project = active[0]?.id ?? (projects.length ? "all" : null);
  const run = nav.run && runs.some((r) => r.id === nav.run) ? nav.run : null;
  return { ...nav, project, run };
}

const PROJECT_KEY = "hub-project";
export function rememberedProject() {
  try {
    return window.localStorage.getItem(PROJECT_KEY);
  } catch {
    return null;
  }
}
export function rememberProject(id: string) {
  try {
    window.localStorage.setItem(PROJECT_KEY, id);
  } catch {
    /* storage unavailable */
  }
}

type Guard = () => boolean;
let leaveGuard: Guard | null = null;
/** Lets a screen with unsaved edits confirm before navigation. */
export function setLeaveGuard(guard: Guard | null) {
  leaveGuard = guard;
}

export function useNav(): [
  NavState,
  (patch: Partial<NavState>, options?: { replace?: boolean }) => void,
] {
  const [nav, setNav] = useState<NavState>(DEFAULT_NAV);
  const current = useRef(nav);
  useEffect(() => {
    const sync = () => {
      current.current = parseNav(window.location.search);
      setNav(current.current);
    };
    // Back/Forward obey the same unsaved-changes guard as in-app navigation.
    const onPop = () => {
      const next = parseNav(window.location.search);
      const prev = current.current;
      const leaving =
        next.project !== prev.project ||
        next.view !== prev.view ||
        next.run !== prev.run;
      if (leaving && leaveGuard && !leaveGuard()) {
        window.history.pushState(
          null,
          "",
          window.location.pathname + serializeNav(prev),
        );
        return;
      }
      sync();
    };
    sync();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const update = useCallback(
    (patch: Partial<NavState>, options?: { replace?: boolean }) => {
      const next = { ...current.current, ...patch };
      const leaving =
        next.project !== current.current.project ||
        next.view !== current.current.view ||
        next.run !== current.current.run;
      if (leaving && leaveGuard && !leaveGuard()) return;
      current.current = next;
      const url = window.location.pathname + serializeNav(next);
      if (options?.replace) window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
      setNav(next);
    },
    [],
  );
  return [nav, update];
}
