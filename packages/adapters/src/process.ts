import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "../../db/src/index";
import { childEnv, id, now, redact } from "../../core/src/paths";
const host = fileURLToPath(
  new URL("../../../scripts/process-host.mjs", import.meta.url),
);
export interface ProcessRecord {
  id: string;
  runId: string;
  stepId: string;
  pid: number;
  token: string;
  identity: string;
  state: "running" | "exited" | "uncertain";
  startedAt: string;
  exitCode: number | null;
  signal: string | null;
}
export interface ProcessResult {
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled: boolean;
}
export function processIdentity(pid: number) {
  try {
    return execFileSync(
      "/bin/ps",
      ["-p", String(pid), "-o", "lstart=,command="],
      { encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  } catch (error) {
    const failure = error as { status?: number; stderr?: Buffer };
    if (failure.status === 1 && !String(failure.stderr || "").trim()) return "";
    throw new Error(
      "Cannot inspect process identity; safe reconciliation blocked",
      { cause: error },
    );
  }
}
function groupAlive(pid: number) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}
export async function stopRecord(store: Store, record: ProcessRecord) {
  const uncertain = () => {
    store.put("process_records", { ...record, state: "uncertain" });
    return false;
  };
  try {
    const identity = processIdentity(record.pid);
    if (!identity) {
      if (groupAlive(record.pid)) return uncertain();
      store.put("process_records", { ...record, state: "exited" });
      return true;
    }
    if (identity !== record.identity || !identity.includes(record.token))
      return uncertain();
    try {
      process.kill(-record.pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") return uncertain();
    }
    await new Promise((r) => setTimeout(r, 150));
    if (groupAlive(record.pid)) {
      if (processIdentity(record.pid) !== record.identity) return uncertain();
      process.kill(-record.pid, "SIGKILL");
    }
    for (let attempt = 0; attempt < 120 && groupAlive(record.pid); attempt++)
      await new Promise((r) => setTimeout(r, 25));
    if (groupAlive(record.pid)) return uncertain();
    store.put("process_records", { ...record, state: "exited" });
    return true;
  } catch {
    return uncertain();
  }
}
export class Processes {
  constructor(readonly store: Store) {}
  async run(
    runId: string,
    stepId: string,
    executable: string,
    args: string[],
    options: {
      cwd: string;
      env?: Record<string, string>;
      stdin?: string;
      timeoutMs?: number;
      signal?: AbortSignal;
      onStdout?: (chunk: string) => void;
    },
  ): Promise<ProcessResult> {
    if (options.signal?.aborted) throw new Error("Cancelled");
    const token = id(),
      directory = join(this.store.root, "runs", runId, "runtime");
    mkdirSync(directory, { recursive: true });
    const manifest = join(directory, token + ".json");
    const logs = join(this.store.root, "runs", runId, "logs");
    mkdirSync(logs, { recursive: true });
    const log = join(logs, token + ".log");
    writeFileSync(
      manifest,
      JSON.stringify({
        executable,
        args,
        cwd: resolve(options.cwd),
        env: childEnv(options.env),
        stdin: options.stdin,
      }),
      { mode: 0o600 },
    );
    const child = spawn(process.execPath, [host, manifest, token], {
      cwd: directory,
      env: childEnv(),
      detached: true,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      shell: false,
    });
    if (!child.pid) throw new Error("Unable to start process host");
    const record: ProcessRecord = {
      id: token,
      runId,
      stepId,
      pid: child.pid,
      token,
      identity: processIdentity(child.pid),
      state: "running",
      startedAt: now(),
      exitCode: null,
      signal: null,
    };
    this.store.put("process_records", record);
    writeFileSync(manifest + ".go", "go", { mode: 0o600 });
    this.store.event(runId, "process", `Started ${executable} (${stepId})`);
    let stdout = "",
      stderr = "",
      total = 0,
      settled = false,
      timedOut = false,
      cancelled = false;
    return new Promise((resolveResult, reject) => {
      const finish = async (code: number | null, signal: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
        const stopped = await stopRecord(this.store, record);
        this.store.put("process_records", {
          ...record,
          state: stopped ? "exited" : "uncertain",
          exitCode: code,
          signal,
        });
        if (!stopped) {
          reject(
            new Error(
              "Process identity uncertain; manual reconciliation required",
            ),
          );
          return;
        }
        resolveResult({ code, signal, stdout, stderr, timedOut, cancelled });
      };
      const abort = () => {
        cancelled = true;
        void finish(null, "SIGTERM");
      };
      const timer = setTimeout(() => {
        timedOut = true;
        void finish(null, "TIMEOUT");
      }, options.timeoutMs ?? 300000);
      options.signal?.addEventListener("abort", abort, { once: true });
      child.stdout?.on("data", (buffer: Buffer) => {
        const chunk = buffer.toString();
        total += buffer.length;
        if (total > 2 * 1024 * 1024) {
          void finish(null, "OUTPUT_LIMIT");
          return;
        }
        stdout += chunk;
        appendFileSync(log, redact(chunk));
        options.onStdout?.(chunk);
      });
      child.stderr?.on("data", (buffer: Buffer) => {
        const chunk = redact(buffer.toString());
        stderr = (stderr + chunk).slice(-32000);
        if (total < 2 * 1024 * 1024) appendFileSync(log, chunk);
        total += buffer.length;
        if (total > 2 * 1024 * 1024) void finish(null, "OUTPUT_LIMIT");
      });
      child.on("message", (message: unknown) => {
        if (
          message &&
          typeof message === "object" &&
          "type" in message &&
          message.type === "exit" &&
          "code" in message &&
          "signal" in message
        ) {
          const m = message as { code: number | null; signal: string | null };
          void finish(m.code, m.signal);
        }
      });
      child.on("error", (error) => {
        void finish(null, "SPAWN_ERROR");
        this.store.event(runId, "error", error.message);
      });
      child.on("exit", (code, signal) => {
        void finish(code, signal);
      });
    });
  }
}
