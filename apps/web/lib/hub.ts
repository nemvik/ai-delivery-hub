"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Project,
  Task,
  Run,
  Snapshot,
  Artifact,
  ScenarioResult,
  ReviewRound,
  QaFinding,
  Settings,
} from "../../../packages/contracts/src/index";

export interface ProviderView {
  id: string;
  provider: string;
  version: string | null;
  status: string;
  problems: string[];
  login: string;
  checkedAt?: string;
  capabilities: { verifiedReadOnlyReview: boolean };
}
export interface DestinationView {
  id: string;
  name: string;
  path: string;
}
export interface HubState {
  loaded: boolean;
  projects: Project[];
  tasks: Task[];
  runs: Run[];
  settings: Settings;
  worker: { heartbeat: number } | null;
  providers: ProviderView[];
  destinations: DestinationView[];
  jobs: { id: string; type: string; state: string; created_at?: string }[];
  notices: { type: string; message: string; created_at?: string }[];
  disk: { bytes: number; retention: { runId: string; bytes: number }[] };
  linearConfigured: boolean;
  home: string | null;
}
export interface RunDetail {
  run: Run;
  snapshot: Snapshot | null;
  artifacts: Artifact[];
  results: ScenarioResult[];
  reviews: ReviewRound[];
  qaFindings: QaFinding[];
  processes: { id: string; pid: number; stepId: string; state: string }[];
  steps: {
    id: string;
    type: string;
    role?: string;
    selection?: { model: string };
    result?: { actualModels: string[] | null };
  }[];
  decisions: {
    id: string;
    findingLocalId: string;
    decision: string;
    author: string;
    reason: string;
    snapshotId: string;
  }[];
  approvals: {
    id: string;
    snapshotId: string;
    author: string;
    reason: string;
    createdAt: string;
  }[];
  gates: Record<
    | "repoChecks"
    | "review"
    | "integrationQa"
    | "nativeQa"
    | "evidenceIntegrity"
    | "humanApproval",
    string
  > | null;
  events: { seq: number; type: string; message: string; createdAt: string }[];
}
export type CallResult<T> =
  { ok: true; data: T } | { ok: false; error: string };

const EMPTY: HubState = {
  loaded: false,
  projects: [],
  tasks: [],
  runs: [],
  settings: {} as Settings,
  worker: null,
  providers: [],
  destinations: [],
  jobs: [],
  notices: [],
  disk: { bytes: 0, retention: [] },
  linearConfigured: false,
  home: null,
};

export function useHub(selectedRun: string | null) {
  const [state, setState] = useState<HubState>(EMPTY);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const csrf = useRef("");
  const selected = useRef(selectedRun);
  selected.current = selectedRun;

  const reload = useCallback(async () => {
    const res = await fetch("/api/v1/state");
    if (res.ok) setState({ ...EMPTY, ...(await res.json()), loaded: true });
    const runId = selected.current;
    if (runId) {
      const d = await fetch("/api/v1/runs/" + runId);
      if (selected.current === runId) setDetail(d.ok ? await d.json() : null);
    } else setDetail(null);
  }, []);

  useEffect(() => {
    void fetch("/api/v1/session")
      .then((r) => r.json())
      .then((s: { csrf: string }) => {
        csrf.current = s.csrf;
        return reload();
      });
    const timer = setInterval(() => void reload(), 1500);
    return () => clearInterval(timer);
  }, [reload]);

  useEffect(() => {
    setDetail(null);
    void reload();
    if (!selectedRun) return;
    const source = new EventSource(`/api/v1/runs/${selectedRun}/events`);
    source.onmessage = () => void reload();
    return () => source.close();
  }, [selectedRun, reload]);

  /** Plain API call without global side effects; callers show errors inline. */
  const call = useCallback(
    async <T>(
      path: string,
      data: unknown,
      key?: string,
    ): Promise<CallResult<T>> => {
      try {
        const response = await fetch("/api/v1/" + path, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-hub-csrf": csrf.current,
            ...(key ? { "Idempotency-Key": key } : {}),
          },
          body: JSON.stringify(data),
        });
        const result = await response.json();
        if (!response.ok)
          return { ok: false, error: readableError(result.error) };
        return { ok: true, data: result as T };
      } catch (e) {
        return { ok: false, error: readableError(String(e)) };
      }
    },
    [],
  );

  /** Mutation with a global busy state, error banner and reload. */
  const mutate = useCallback(
    async <T = unknown>(path: string, data: unknown, key?: string) => {
      setBusy(true);
      setError("");
      const result = await call<T>(path, data, key);
      if (result.ok) await reload();
      else setError(result.error);
      setBusy(false);
      return result.ok ? result.data : null;
    },
    [call, reload],
  );

  const startTask = useCallback(
    (task: Task) =>
      mutate<Run>(`change-sets/${task.id}/runs`, {}, crypto.randomUUID()),
    [mutate],
  );

  return {
    state,
    detail,
    busy,
    error,
    notice,
    setError,
    setNotice,
    call,
    mutate,
    reload,
    startTask,
  };
}
export type Hub = ReturnType<typeof useHub>;

/** Turns Zod issue dumps and internal messages into one readable sentence. */
export function readableError(raw: unknown): string {
  const text = String(raw ?? "Something went wrong");
  try {
    const issues = JSON.parse(text) as { path?: unknown[]; message?: string }[];
    if (Array.isArray(issues) && issues.length)
      return issues
        .slice(0, 3)
        .map((i) =>
          i.path?.length ? `${i.path.join(" → ")}: ${i.message}` : i.message,
        )
        .join(" · ");
  } catch {
    /* not a Zod dump */
  }
  return text.replace(/^Error:\s*/, "");
}

const AUTHOR_KEY = "hub-author";
export function rememberedAuthor() {
  try {
    return window.localStorage.getItem(AUTHOR_KEY) || "";
  } catch {
    return "";
  }
}
export function rememberAuthor(name: string) {
  try {
    if (name.trim()) window.localStorage.setItem(AUTHOR_KEY, name.trim());
  } catch {
    /* storage unavailable */
  }
}
