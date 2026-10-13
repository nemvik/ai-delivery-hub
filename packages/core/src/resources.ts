import { Store } from "../../db/src/index";
import type { Run } from "../../contracts/src/index";
export class Resources {
  constructor(
    readonly store: Store,
    readonly owner: string,
    readonly fence: number,
  ) {}
  acquire(runId: string, resources: string[]): boolean {
    return this.store.sql
      .transaction(() => {
        const worker = this.store.sql
          .prepare("SELECT owner,fence FROM worker_lock WHERE id=1")
          .get() as { owner: string; fence: number } | undefined;
        if (
          !worker ||
          worker.owner !== this.owner ||
          worker.fence !== this.fence
        )
          throw new Error("Worker fenced");
        const settings = this.store.settings();
        const limits: Record<string, number> = {
          agent: settings.maxAgentProcesses,
          qa: settings.maxQaEnvironments,
          browser: settings.maxBrowserWorkersTotal,
          build: settings.maxHeavyBuilds,
          native: settings.maxNativeDevicesInUse,
        };
        const sorted = [...new Set(resources)].sort();
        for (const resource of sorted) {
          const used = this.store.sql
            .prepare("SELECT owner FROM resource_leases WHERE resource=?")
            .all(resource) as { owner: string }[];
          if (used.some((r) => r.owner === runId)) continue;
          if (used.length >= (limits[resource] || 1)) return false;
        }
        for (const resource of sorted)
          this.store.sql
            .prepare("INSERT OR IGNORE INTO resource_leases VALUES(?,?,?,?)")
            .run(resource, runId, this.fence, Date.now());
        return true;
      })
      .immediate();
  }
  release(runId: string, resources?: string[]) {
    // A lease protects the environment until every owned process is confirmed dead.
    // This check is also required for intermediate scopes, before Worker.finally.
    if (
      this.store
        .list<{ runId: string; state: string }>("process_records")
        .some((p) => p.runId === runId && p.state !== "exited")
    )
      return;
    if (resources)
      for (const resource of resources)
        this.store.sql
          .prepare(
            "DELETE FROM resource_leases WHERE owner=? AND resource=? AND fence=?",
          )
          .run(runId, resource, this.fence);
    else
      this.store.sql
        .prepare("DELETE FROM resource_leases WHERE owner=? AND fence=?")
        .run(runId, this.fence);
  }
  async with<T>(
    runId: string,
    resources: string[],
    signal: AbortSignal,
    fn: () => Promise<T>,
  ) {
    const alreadyHeld = new Set(
      (
        this.store.sql
          .prepare(
            "SELECT resource FROM resource_leases WHERE owner=? AND fence=?",
          )
          .all(runId, this.fence) as { resource: string }[]
      ).map((r) => r.resource),
    );
    while (!this.acquire(runId, resources)) {
      if (signal.aborted) throw new Error("Cancelled");
      this.store.updateRun(runId, {
        queueReason: "Waiting for " + resources.join(", "),
      });
      await new Promise((r) => setTimeout(r, 100));
    }
    this.store.updateRun(runId, { queueReason: null });
    try {
      if (signal.aborted) throw new Error("Cancelled");
      return await fn();
    } finally {
      this.release(
        runId,
        resources.filter((r) => !alreadyHeld.has(r)),
      );
    }
  }
  heartbeat() {
    this.store.sql
      .prepare("UPDATE resource_leases SET heartbeat=? WHERE fence=?")
      .run(Date.now(), this.fence);
  }
}
export function unfinished(run: Run) {
  return ["queued", "running", "paused", "interrupted"].includes(run.state);
}
