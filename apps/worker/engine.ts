import { generateDemo } from "../../packages/test-fixtures/src/generate";
import { configuredQa } from "../../packages/adapters/src/runtime";
import { testConnection } from "../../packages/adapters/src/smoke";
import { importLinear } from "../../packages/adapters/src/linear";
import { statfsSync } from "node:fs";
import { Store } from "../../packages/db/src/index";
import {
  Processes,
  processIdentity,
  stopRecord,
  type ProcessRecord,
} from "../../packages/adapters/src/process";
import { webQa, saveResult } from "../../packages/adapters/src/qa";
import { GitWorkspaces, pinProject } from "../../packages/adapters/src/git";
import { CliProviders, doctor } from "../../packages/adapters/src/providers";
import {
  contractCheck,
  approvedChecks,
  testScope,
} from "../../packages/adapters/src/checks";
import {
  createReport,
  publishReport,
  diskUsage,
  cleanupEvidence,
} from "../../packages/adapters/src/publisher";
import { nativeQa } from "../../packages/adapters/src/native";
import { join } from "node:path";
import { gates } from "../../packages/core/src/gates";
import { Resources } from "../../packages/core/src/resources";
import { startRun } from "../../packages/core/src/service";
import { selectedReviewSkills } from "../../packages/core/src/review-skills";
import { id, now } from "../../packages/core/src/paths";
import type {
  Run,
  Snapshot,
  QaFinding,
  Review,
  ReviewRound,
  ScenarioResult,
} from "../../packages/contracts/src/index";
export class Worker {
  readonly owner = id();
  readonly processes: Processes;
  readonly active = new Map<string, AbortController>();
  private stopping = false;
  private jobs = new Set<Promise<void>>();
  private shutdown = new AbortController();
  private fence = 0;
  private resources!: Resources;
  private lastTick = Date.now();
  private recoveryBlocked = false;
  constructor(readonly store: Store) {
    this.processes = new Processes(store);
  }
  async acquire() {
    const identity = processIdentity(process.pid);
    this.store.sql
      .transaction(() => {
        const lock = this.store.sql
          .prepare("SELECT * FROM worker_lock")
          .get() as
          { pid: number; identity: string; fence: number } | undefined;
        if (lock && processIdentity(lock.pid) === lock.identity)
          throw new Error("Another worker owns this database");
        this.fence = (lock?.fence ?? 0) + 1;
        this.store.sql
          .prepare("INSERT OR REPLACE INTO worker_lock VALUES(1,?,?,?,?,?)")
          .run(this.owner, process.pid, identity, Date.now(), this.fence);
      })
      .immediate();
    this.resources = new Resources(this.store, this.owner, this.fence);
    await this.reconcile();
  }
  async reconcile() {
    for (const record of this.store
      .list<ProcessRecord>("process_records")
      .filter((p) => p.state === "running" || p.state === "uncertain")) {
      const stopped = await stopRecord(this.store, record);
      if (!stopped) this.recoveryBlocked = true;
      const run = this.store.get<Run>("runs", record.runId);
      if (run)
        this.store.updateRun(run.id, {
          state: "interrupted",
          error: stopped
            ? "Worker restarted; owned process terminated. Retry creates a new run."
            : "Process identity uncertain; no new runs until manually reconciled.",
        });
    }
    for (const run of this.store
      .list<Run>("runs")
      .filter((r) => r.state === "running"))
      this.store.updateRun(run.id, {
        state: "interrupted",
        error: "Worker restarted; automatic resumption disabled.",
      });
    this.store.sql
      .prepare("UPDATE commands SET state='pending' WHERE state='claimed'")
      .run();
    if (!this.recoveryBlocked)
      this.store.sql.prepare("DELETE FROM resource_leases").run();
  }
  async handle(
    type: string,
    run: Run | undefined,
    data: Record<string, unknown>,
  ) {
    if (type === "demo") {
      generateDemo(this.store);
      return;
    }
    if (type === "doctor") {
      if (this.active.size)
        throw new Error(
          "Wait for active runs before CLI capability inspection",
        );
      doctor(data.provider as "codex-cli" | "claude-code-cli", this.store);
      return;
    }
    if (type === "test-connection") {
      await testConnection(this.store, data.selection, this.shutdown.signal);
      return;
    }
    if (type === "linear-import") {
      await importLinear(
        this.store,
        String(data.projectId),
        String(data.issueId),
      );
      return;
    }
    if (!run) return;
    if (type === "cancel" || type === "pause") {
      if (!["running", "queued"].includes(run.state)) return;
      this.active.get(run.id)?.abort();
      this.store.updateRun(run.id, {
        state: type === "cancel" ? "cancelled" : "paused",
        queueReason: null,
      });
      this.store.event(run.id, type, "Requested by user");
      return;
    }
    if (type === "retry") {
      if (
        ![
          "cancelled",
          "paused",
          "failed",
          "blocked",
          "interrupted",
          "needs_input",
        ].includes(run.state)
      )
        throw new Error("Run is not retryable");
      if (
        this.active.has(run.id) ||
        this.store
          .list<ProcessRecord>("process_records")
          .some((p) => p.runId === run.id && p.state !== "exited")
      )
        throw new Error("Owned processes are not reconciled");
      startRun(this.store, run.taskId, "retry-" + run.id);
      return;
    }
    if (type === "refresh-baseline") {
      const current = pinProject(run.config.project, run.config.task.refs);
      const stale = current.some((p) => {
        const old = run.config.pins.find((x) => x.repoKey === p.repoKey);
        return old?.headSha !== p.headSha || old.baselineSha !== p.baselineSha;
      });
      if (stale) {
        this.store.updateRun(run.id, {
          stale: true,
          state: run.state === "verified" ? "awaiting_human_qa" : run.state,
        });
        this.store.event(
          run.id,
          "stale",
          "Source baseline/ref moved; historical evidence retained. Start a new run.",
        );
      }
      return;
    }
    if (type === "publish") {
      if (this.active.has(run.id))
        throw new Error("Wait for run cleanup before publishing");
      publishReport(this.store, run, String(data.destinationId));
      return;
    }
    if (type === "archive") {
      if (["queued", "running", "paused", "interrupted"].includes(run.state))
        throw new Error("Active work is protected");
      this.store.updateRun(run.id, { archived: true });
      return;
    }
    if (type === "cleanup-evidence") {
      if (this.active.has(run.id)) throw new Error("Active work is protected");
      cleanupEvidence(this.store, run);
      return;
    }
    if (type === "approve") {
      if (
        run.state !== "awaiting_human_qa" ||
        run.stale ||
        data.snapshotId !== run.snapshotId
      )
        throw new Error("Approval does not match an eligible current snapshot");
      const snapshot = this.store.get<Snapshot>("snapshots", run.snapshotId!)!;
      new GitWorkspaces(this.store).assertUnchanged(snapshot);
      const gate = gates(this.store, run, snapshot);
      if (
        gate.manualScenarios.some(
          (s) => !((data.manualScenarioIds as string[]) || []).includes(s),
        )
      )
        throw new Error("Confirm each required manual scenario");
      if (!gate.automatic)
        throw new Error("Required machine checks have not passed");
      this.store.put("human_approvals", {
        id: run.id + ":" + snapshot.id,
        runId: run.id,
        snapshotId: snapshot.id,
        planHash: snapshot.planHash,
        author: data.author,
        reason: data.reason,
        createdAt: now(),
      });
      this.store.updateRun(run.id, { state: "verified" });
      this.store.event(
        run.id,
        "verified",
        `Human approval by ${String(data.author)}`,
      );
      return;
    }
  }
  async tick() {
    if (this.stopping) return;
    const current = Date.now();
    if (current - this.lastTick > 30000 || current < this.lastTick) {
      for (const [runId, controller] of this.active) {
        this.store.updateRun(runId, {
          state: "interrupted",
          error:
            "Clock discontinuity or sleep detected; process stopped conservatively.",
        });
        controller.abort();
      }
    }
    this.lastTick = current;
    const owned = this.store.sql
      .prepare("UPDATE worker_lock SET heartbeat=? WHERE owner=? AND fence=?")
      .run(current, this.owner, this.fence);
    if (!owned.changes) {
      for (const c of this.active.values()) c.abort();
      throw new Error("Worker fencing lost");
    }
    this.resources.heartbeat();
    let c;
    while ((c = this.store.claim())) {
      try {
        if (["test-connection", "linear-import"].includes(c.type)) {
          if (this.jobs.size)
            throw new Error("An integration check is already running");
          if (c.type === "test-connection" && this.active.size)
            throw new Error(
              "Wait for active runs before a live provider smoke test",
            );
          const command = c;
          const job = this.handle(
            command.type,
            undefined,
            JSON.parse(command.data) as Record<string, unknown>,
          )
            .then(() => {
              this.store.finish(command.id);
              this.store.event(
                null,
                "integration_complete",
                command.type + " completed",
              );
            })
            .catch((error) => {
              this.store.event(null, "error", String(error));
              this.store.finish(command.id, "failed");
            })
            .finally(() => this.jobs.delete(job));
          this.jobs.add(job);
        } else {
          await this.handle(
            c.type,
            c.run_id ? this.store.get<Run>("runs", c.run_id) : undefined,
            JSON.parse(c.data) as Record<string, unknown>,
          );
          this.store.finish(c.id);
        }
      } catch (error) {
        this.store.event(c.run_id, "error", String(error));
        this.store.finish(c.id, "failed");
      }
    }
    const disk = statfsSync(this.store.root);
    const budgetExceeded =
      diskUsage(join(this.store.root, "artifacts")) >
      this.store.settings().maxArtifactGiB * 1024 ** 3;
    for (const run of this.store
      .list<Run>("runs")
      .filter((r) => r.state === "queued")
      .reverse()) {
      if (this.jobs.size) {
        this.store.updateRun(run.id, {
          queueReason: "Waiting for explicit integration check",
        });
        continue;
      }
      if (this.recoveryBlocked) {
        this.store.updateRun(run.id, {
          queueReason: "Recovery blocked: uncertain process identity",
        });
        continue;
      }
      if (budgetExceeded || disk.bavail * disk.bsize < 50 * 1024 * 1024) {
        this.store.updateRun(run.id, {
          queueReason: "Insufficient disk space; new runs paused",
        });
        continue;
      }
      if (this.active.size >= this.store.settings().maxActiveRuns) {
        this.store.updateRun(run.id, {
          queueReason: "Waiting for active run slot",
        });
        continue;
      }
      const controller = new AbortController();
      this.active.set(run.id, controller);
      void this.execute(run, controller.signal).finally(() =>
        this.active.delete(run.id),
      );
    }
  }
  async execute(run: Run, signal: AbortSignal) {
    this.store.updateRun(run.id, { state: "running", queueReason: null });
    this.store.event(run.id, "started", "Worker owns this run");
    const timeout = AbortSignal.timeout(run.config.task.maxRunMinutes * 60000);
    const combined = AbortSignal.any([signal, timeout]);
    const use = <T>(resources: string[], fn: () => Promise<T>) =>
      this.resources.with(run.id, resources, combined, fn);
    let snapshot: Snapshot | null = null;
    try {
      if (
        run.config.task.blockers.some(
          (b) => !run.config.task.dependencyPins.some((p) => p.issue === b),
        )
      )
        throw new Error(
          "BLOCKED: unresolved dependency requires explicit revision pin",
        );
      if (
        run.config.task.mode === "implement_review_qa" &&
        run.config.task.risky &&
        !run.config.task.riskApproval
      )
        throw new Error(
          "BLOCKED: risky implementation requires human scope approval",
        );
      for (const pin of run.config.task.dependencyPins)
        if (
          run.config.pins.find((p) => p.repoKey === pin.repoKey)?.headSha !==
          pin.sha
        )
          throw new Error(
            "BLOCKED: dependency pin differs from selected assembly",
          );
      const git = new GitWorkspaces(this.store);
      const workspaces = git.provision(run),
        providers = new CliProviders(this.store, this.processes);
      if (run.config.task.mode === "implement_review_qa")
        await use(["agent"], () =>
          providers.invoke(run, "implementer", workspaces, null, combined),
        );
      snapshot = git.checkpoint(run, workspaces);
      testScope(snapshot, run.config.lockedTests);
      let blockedReview = false;
      let priorReview: Review | null = null;
      for (let round = 1; round <= run.config.task.maxReviewRounds; round++) {
        const currentSnapshot = snapshot;
        await approvedChecks(
          this.store,
          run,
          currentSnapshot,
          this.processes,
          combined,
          use,
        );
        if (
          run.config.project.demo &&
          run.config.project.scenarios.some((s) => s.kind === "contract")
        )
          await contractCheck(
            this.store,
            run,
            currentSnapshot,
            this.processes,
            combined,
          );
        git.assertUnchanged(currentSnapshot);
        if (run.config.task.mode === "qa_only") break;
        let result;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            result = await use(["agent"], () =>
              providers.invoke(
                run,
                "reviewer",
                currentSnapshot.repositories,
                currentSnapshot,
                combined,
                priorReview,
              ),
            );
            break;
          } catch (error) {
            if (attempt === 1 || !/JSON|schema|structured/.test(String(error)))
              throw error;
            this.store.event(
              run.id,
              "warning",
              "Retrying invalid review format once; snapshot remains unchanged.",
            );
          }
        }
        if (!result) throw new Error("Missing review result");
        const review = result.structuredOutput as Review;
        priorReview = review;
        this.store.put("review_rounds", {
          id: id(),
          runId: run.id,
          snapshotId: currentSnapshot.id,
          round,
          review,
          requestedModel: result.requestedModel,
          actualModels: result.actualModels,
          appliedSkills: selectedReviewSkills(run, currentSnapshot).map(
            (s) => s.applied,
          ),
          createdAt: now(),
        } satisfies ReviewRound);
        for (const finding of review.findings)
          this.store.put("findings", {
            ...finding,
            id: id(),
            runId: run.id,
            snapshotId: currentSnapshot.id,
            round,
          });
        git.assertUnchanged(currentSnapshot);
        const blocking =
          review.verdict === "incomplete" ||
          review.coverageGaps.length > 0 ||
          review.findings.some((f) => ["P0", "P1"].includes(f.severity));
        if (!blocking) break;
        if (
          run.config.task.mode === "review_qa" ||
          round === run.config.task.maxReviewRounds ||
          review.verdict === "incomplete"
        ) {
          blockedReview = true;
          break;
        }
        await use(["agent"], () =>
          providers.invoke(
            run,
            "implementer",
            currentSnapshot.repositories,
            currentSnapshot,
            combined,
            review,
          ),
        );
        snapshot = git.checkpoint(run, currentSnapshot.repositories);
        testScope(snapshot, run.config.lockedTests);
      }
      const finalSnapshot = snapshot;
      if (
        run.config.project.scenarios.some(
          (s) => s.kind === "web" && !s.commandId,
        )
      )
        await use(
          [
            "qa",
            "browser",
            ...run.config.project.exclusiveResources.map(
              (r) => "exclusive:" + r,
            ),
          ],
          () => webQa(this.store, run, finalSnapshot, this.processes, combined),
        );
      if (
        run.config.project.runtime ||
        run.config.project.commands.some((c) => c.phase === "qa")
      )
        await use(
          [
            "qa",
            "browser",
            ...run.config.project.commands
              .filter((c) => c.phase === "qa" || c.kind === "start")
              .flatMap((c) => [
                ...c.resourceIds.map((r) => "exclusive:" + r),
                ...(c.kind === "build" ? ["build"] : []),
              ]),
            ...run.config.project.exclusiveResources.map(
              (r) => "exclusive:" + r,
            ),
          ],
          () =>
            configuredQa(
              this.store,
              run,
              finalSnapshot,
              this.processes,
              combined,
            ),
        );
      if (run.config.project.scenarios.some((s) => s.kind === "native"))
        await use(
          [
            "native",
            ...run.config.project.exclusiveResources.map(
              (r) => "exclusive:" + r,
            ),
            ...run.config.project.commands
              .filter(
                (c) =>
                  c.id === run.config.project.native?.verificationCommandId,
              )
              .flatMap((c) => [
                ...c.resourceIds.map((r) => "exclusive:" + r),
                ...(c.kind === "build" ? ["build"] : []),
              ]),
            ...(run.config.project.native
              ? ["exclusive:device-" + run.config.project.native.deviceId]
              : []),
          ],
          () =>
            nativeQa(this.store, run, finalSnapshot, this.processes, combined),
        );
      for (const scenario of run.config.project.scenarios) {
        const exists = this.store
          .list<ScenarioResult>("scenario_results")
          .some(
            (r) =>
              r.runId === run.id &&
              r.snapshotId === finalSnapshot.id &&
              r.scenarioId === scenario.id,
          );
        if (!exists)
          saveResult(
            this.store,
            run,
            finalSnapshot,
            scenario.id,
            "not_run",
            scenario.kind === "native"
              ? "Native build/device/flow is not configured."
              : scenario.kind === "manual"
                ? "Human evidence and verification required."
                : "No approved runner produced this scenario.",
          );
      }
      git.assertUnchanged(finalSnapshot);
      if (combined.aborted) throw new Error("Run cancelled or timed out");
      const gate = gates(
        this.store,
        this.store.get<Run>("runs", run.id)!,
        finalSnapshot,
      );
      this.store.updateRun(run.id, {
        state: blockedReview
          ? "needs_input"
          : gate.automatic
            ? "awaiting_human_qa"
            : "failed",
      });
      this.store.event(
        run.id,
        "completed",
        blockedReview
          ? "Review needs human input; no additional automatic fixes."
          : gate.automatic
            ? "Machine gates passed; human QA required."
            : "Required gates did not pass.",
      );
    } catch (error) {
      if (!signal.aborted) {
        const text = String(error);
        this.store.updateRun(run.id, {
          state: timeout.aborted
            ? "interrupted"
            : text.includes("limit_reached")
              ? "paused"
              : text.includes("BLOCKED:") || text.includes("Provider blocked")
                ? "blocked"
                : text.includes("Required test changed")
                  ? "needs_input"
                  : "failed",
          error: text,
        });
        this.store.event(run.id, "error", text);
      }
    } finally {
      const uncertain = this.store
        .list<ProcessRecord>("process_records")
        .some((p) => p.runId === run.id && p.state !== "exited");
      if (uncertain) {
        this.recoveryBlocked = true;
        this.store.updateRun(run.id, {
          state: "interrupted",
          error: "Process cleanup could not be confirmed. Resources retained.",
        });
      } else this.resources.release(run.id);
      if (snapshot) {
        try {
          for (const result of this.store.list<ScenarioResult>(
            "scenario_results",
          )) {
            if (
              result.runId !== run.id ||
              result.snapshotId !== snapshot.id ||
              result.status !== "failed"
            )
              continue;
            const findingId = "qa-" + result.id;
            this.store.put("findings", {
              id: findingId,
              localId: findingId,
              runId: run.id,
              snapshotId: snapshot.id,
              source: "qa",
              resultId: result.id,
              scenarioId: result.scenarioId,
              title: "QA failed: " + result.scenarioId,
              expected: result.expected,
              observed: result.observed,
              evidenceIds: result.evidenceIds,
              createdAt: result.createdAt,
            } satisfies QaFinding);
          }
          createReport(
            this.store,
            this.store.get<Run>("runs", run.id)!,
            snapshot,
          );
        } catch (error) {
          this.store.event(run.id, "report_error", String(error));
          this.store.updateRun(run.id, {
            state: "failed",
            error: "Report generation failed: " + String(error),
          });
        }
      }
    }
  }
  async stop() {
    this.stopping = true;
    this.shutdown.abort();
    for (const [runId, c] of this.active) {
      if (this.store.get<Run>("runs", runId)?.state === "running")
        this.store.updateRun(runId, {
          state: "interrupted",
          error: "Worker stopped; explicit retry required.",
        });
      c.abort();
    }
    while (this.active.size) await new Promise((r) => setTimeout(r, 100));
    await Promise.allSettled(this.jobs);
    this.store.sql
      .prepare("DELETE FROM worker_lock WHERE owner=?")
      .run(this.owner);
  }
}
