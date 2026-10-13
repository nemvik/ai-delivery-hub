import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Store } from "../../db/src/index";
import type { Run, Snapshot } from "../../contracts/src/index";
import { Processes, type ProcessResult } from "./process";
import { freePort } from "./qa";
import { commandInput, approvedChecks } from "./checks";
import { id, now } from "../../core/src/paths";
export async function configuredQa(
  store: Store,
  run: Run,
  snapshot: Snapshot,
  processes: Processes,
  signal: AbortSignal,
) {
  const profile = run.config.project.runtime;
  if (!profile) {
    await approvedChecks(
      store,
      run,
      snapshot,
      processes,
      signal,
      undefined,
      "qa",
    );
    return;
  }
  if (
    profile.isolation === "shared" &&
    !run.config.project.exclusiveResources.length
  )
    throw new Error(
      "Shared QA requires an explicit exclusive environment resource",
    );
  const root = join(store.root, "runs", run.id, "runtime", "services");
  mkdirSync(root, { recursive: true });
  const variables: Record<string, string> = {
    "paths.runtime": root,
    "run.id": run.id,
    "snapshot.id": snapshot.id,
  };
  const uniquePorts = new Set(profile.services.map((s) => s.portKey));
  for (const key of uniquePorts)
    variables["ports." + key] = String(await freePort());
  const manifest = {
    runId: run.id,
    snapshotId: snapshot.id,
    variables,
    databaseNamespace: run.id,
    seed: run.id,
    cachePrefix: run.id,
    uploadPrefix: run.id,
    isolation: profile.isolation,
  };
  writeFileSync(
    join(root, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    { mode: 0o600 },
  );
  store.put("steps", {
    id: id(),
    runId: run.id,
    type: "configured-runtime",
    manifest,
    createdAt: now(),
  });
  const controllers: AbortController[] = [],
    processesRunning: Promise<unknown>[] = [],
    outcomes: ProcessResult[] = [];
  let serviceFailure: unknown;
  let tearingDown = false;
  const failureSignal = new AbortController();
  const abort = () => controllers.forEach((c) => c.abort());
  signal.addEventListener("abort", abort, { once: true });
  try {
    for (const service of profile.services) {
      if (signal.aborted) throw new Error("Cancelled");
      const command = run.config.project.commands.find(
        (c) => c.id === service.commandId && c.kind === "start",
      );
      if (!command) throw new Error("Missing approved service start command");
      const input = commandInput(command, snapshot, run, variables),
        controller = new AbortController();
      controllers.push(controller);
      const promise = processes.run(
        run.id,
        "service:" + service.key,
        input.executable,
        input.args,
        {
          ...input,
          signal: controller.signal,
          timeoutMs: command.timeoutSeconds * 1000,
        },
      );
      let serviceExit: unknown;
      // Attach the rejection handler immediately, including before readiness.
      processesRunning.push(
        promise.then(
          (result) => {
            serviceExit = result;
            outcomes.push(result);
            if (!tearingDown) {
              serviceFailure = new Error(
                "Service exited during QA: " + service.key,
              );
              failureSignal.abort();
            }
          },
          (error) => {
            serviceExit = error;
            serviceFailure = error;
            failureSignal.abort();
          },
        ),
      );
      const url = `http://127.0.0.1:${variables["ports." + service.portKey]}${service.readinessPath}`;
      const expected = service.identityValue.replace(
        /\{\{([^}]+)\}\}/g,
        (_, key: string) =>
          variables[key] ||
          snapshot.repositories.find((r) => "revisions." + r.repoKey === key)
            ?.headSha ||
          "",
      );
      if (!expected) throw new Error("Readiness requires an identity value");
      let ready = false;
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline && !signal.aborted) {
        if (serviceExit)
          throw new Error("Service exited before readiness: " + service.key);
        try {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(500),
          });
          if (response.ok) {
            const body = (await response.json()) as Record<string, unknown>;
            if (body[service.identityField] !== expected)
              throw new Error("Service readiness identity mismatch");
            ready = true;
            break;
          }
        } catch (error) {
          if (String(error).includes("identity mismatch")) throw error;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!ready) throw new Error("Service readiness timeout: " + service.key);
    }
    await approvedChecks(
      store,
      run,
      snapshot,
      processes,
      AbortSignal.any([signal, failureSignal.signal]),
      undefined,
      "qa",
      variables,
    );
  } finally {
    tearingDown = true;
    abort();
    await Promise.allSettled(processesRunning);
    signal.removeEventListener("abort", abort);
  }
  if (serviceFailure || outcomes.some((r) => r.timedOut || !r.cancelled))
    throw new Error("Required QA service stopped unexpectedly", {
      cause: serviceFailure,
    });
}
