import { z } from "zod";
import {
  settingsSchema,
  roleSchema,
} from "../../../../../../packages/contracts/src/index";
import {
  retentionPreview,
  diskUsage,
  registerDestination,
} from "../../../../../../packages/adapters/src/publisher";
import {
  manualEvidence,
  decideFinding,
  reviewArtifact,
} from "../../../../../../packages/core/src/manual";
import { id } from "../../../../../../packages/core/src/paths";
import { gates } from "../../../../../../packages/core/src/gates";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { Store } from "../../../../../../packages/db/src/index";
import {
  localRequest,
  session,
  authenticate,
} from "../../../../../../packages/core/src/auth";
import {
  createProject,
  createTask,
  startRun,
  action,
} from "../../../../../../packages/core/src/service";
import { safePath, hash } from "../../../../../../packages/core/src/paths";
import { artifactRoot } from "../../../../../../packages/adapters/src/artifacts";
import type {
  Run,
  Artifact,
  Snapshot,
} from "../../../../../../packages/contracts/src/index";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let store: Store;
function db() {
  return (store ??= new Store());
}
async function handler(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const path = (await context.params).path;
    const s = db();
    localRequest(request);
    if (path.join("/") === "session" && request.method === "GET") {
      const token = session(s.root);
      return Response.json(
        { csrf: token.csrf },
        {
          headers: {
            "Set-Cookie": `hub_session=${token.cookie}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`,
            "Cache-Control": "no-store",
          },
        },
      );
    }
    authenticate(request, s.root);
    const read = request.method === "GET";
    let body: unknown = {};
    if (!read) {
      const limit = path[2] === "manual-evidence" ? 8 * 1024 * 1024 : 512000;
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader)
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > limit) {
            await reader.cancel();
            throw new Error("Request too large");
          }
          chunks.push(chunk.value);
        }
      const raw = Buffer.concat(chunks).toString("utf8");
      body = JSON.parse(raw || "{}");
    }
    if (read && path[0] === "state")
      return Response.json({
        projects: s.list("projects"),
        tasks: s.list("change_sets"),
        runs: s.list("runs"),
        settings: s.settings(),
        worker:
          s.sql.prepare("SELECT heartbeat FROM worker_lock").get() || null,
        providers: s.list("provider_profiles"),
        destinations: s.list("publisher_destinations"),
        jobs: s.sql
          .prepare(
            "SELECT id,type,state,created_at FROM commands WHERE type IN ('doctor','test-connection','linear-import') ORDER BY rowid DESC LIMIT 10",
          )
          .all(),
        notices: s.sql
          .prepare(
            "SELECT type,message,created_at FROM events WHERE run_id IS NULL ORDER BY seq DESC LIMIT 10",
          )
          .all(),
        disk: {
          bytes: diskUsage(join(s.root, "artifacts")),
          retention: retentionPreview(s),
        },
        linearConfigured: !!process.env.HUB_LINEAR_TOKEN,
      });
    if (path[0] === "demo" && !read)
      return Response.json(s.enqueue("demo", null, {}, "create-demo-project"), {
        status: 202,
      });
    if (path[0] === "settings" && !read) {
      const value = settingsSchema.parse(body);
      const prior = s.settings();
      value.models = value.models.map((m) => ({
        ...m,
        availability:
          prior.models.find(
            (p) =>
              p.provider === m.provider &&
              p.id === m.id &&
              JSON.stringify(p.effortOptions) ===
                JSON.stringify(m.effortOptions),
          )?.availability || "unverified",
      }));
      s.put("settings", { id: "global", value });
      s.event(
        null,
        "settings",
        "Execution settings updated for future resource allocation.",
      );
      return Response.json(value);
    }
    if (path[0] === "destinations" && !read) {
      const value = z
        .object({
          name: z.string().min(1).max(100),
          path: z.string().min(1).max(1000),
        })
        .strict()
        .parse(body);
      return Response.json(registerDestination(s, value.name, value.path));
    }
    if (path[0] === "providers" && !read) {
      const provider = z.enum(["codex-cli", "claude-code-cli"]).parse(path[1]);
      if (!["doctor", "test-connection"].includes(path[2]!))
        throw new Error("Unknown provider action");
      const data =
        path[2] === "doctor"
          ? { provider }
          : {
              provider,
              selection: roleSchema.parse({ ...(body as object), provider }),
            };
      return Response.json(s.enqueue(path[2]!, null, data, id()), {
        status: 202,
      });
    }
    if (path.join("/") === "integrations/linear/import" && !read) {
      const data = z
        .object({
          projectId: z.string().uuid(),
          issueId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
        })
        .strict()
        .parse(body);
      return Response.json(s.enqueue("linear-import", null, data, id()), {
        status: 202,
      });
    }
    if (path[0] === "projects") {
      if (read) return Response.json(s.list("projects"));
      return Response.json(createProject(s, body), { status: 201 });
    }
    if (path[0] === "change-sets") {
      if (read) return Response.json(s.list("change_sets"));
      if (path[2] === "runs")
        return Response.json(
          startRun(s, path[1]!, request.headers.get("idempotency-key") || ""),
          { status: 202 },
        );
      return Response.json(createTask(s, body), { status: 201 });
    }
    if (path[0] === "runs" && path[1]) {
      const run = s.get<Run>("runs", path[1]);
      if (!run) return Response.json({ error: "Not found" }, { status: 404 });
      if (path[2] === "finding-decisions" && !read)
        return Response.json(decideFinding(s, run, body));
      if (path[2] === "manual-evidence" && !read)
        return Response.json(manualEvidence(s, run, body), { status: 201 });
      if (path[2] === "actions" && !read)
        return Response.json(
          action(s, run.id, body as Parameters<typeof action>[2]),
          { status: 202 },
        );
      if (path[2] === "events" && read) {
        let cursor = Number(
          request.headers.get("last-event-id") ||
            new URL(request.url).searchParams.get("after") ||
            0,
        );
        if (!Number.isSafeInteger(cursor) || cursor < 0) cursor = 0;
        let timer: ReturnType<typeof setInterval> | undefined;
        const stream = new ReadableStream({
          start(controller) {
            const send = () => {
              for (const raw of s.events(run.id, cursor)) {
                const event = raw as { seq: number };
                cursor = event.seq;
                controller.enqueue(
                  new TextEncoder().encode(
                    `id: ${cursor}\ndata: ${JSON.stringify(event)}\n\n`,
                  ),
                );
              }
              controller.enqueue(new TextEncoder().encode(": heartbeat\n\n"));
            };
            send();
            timer = setInterval(send, 1500);
            request.signal.addEventListener(
              "abort",
              () => {
                clearInterval(timer);
                try {
                  controller.close();
                } catch {
                  /* closed */
                }
              },
              { once: true },
            );
          },
          cancel() {
            clearInterval(timer);
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
          },
        });
      }
      const related = (table: Parameters<Store["list"]>[0]) =>
        s.list<{ runId: string }>(table).filter((x) => x.runId === run.id);
      if (path[2] === "artifacts" && read)
        return Response.json(related("artifacts"));
      const snapshot = run.snapshotId
        ? s.get<Snapshot>("snapshots", run.snapshotId)
        : null;
      return Response.json({
        run,
        snapshot,
        gates: snapshot ? gates(s, run, snapshot) : null,
        events: s.events(run.id),
        artifacts: related("artifacts"),
        results: related("scenario_results"),
        reviews: related("review_rounds"),
        qaFindings: related("findings").filter(
          (f) => "source" in f && f.source === "qa",
        ),
        steps: related("steps"),
        approvals: related("human_approvals"),
        decisions: related("finding_decisions"),
        processes: related("process_records"),
      });
    }
    if (!read && path[0] === "artifacts" && path[2] === "review")
      return Response.json(reviewArtifact(s, path[1]!, body));
    if (read && path[0] === "artifacts" && path[2] === "content") {
      const artifact = s.get<Artifact>("artifacts", path[1]!);
      if (!artifact)
        return Response.json({ error: "Not found" }, { status: 404 });
      const run = s.get<Run>("runs", artifact.runId)!;
      const bytes = readFileSync(
        safePath(
          artifactRoot(s, run, artifact.snapshotId),
          artifact.relativePath,
        ),
      );
      if (hash(bytes) !== artifact.sha256)
        throw new Error("Artifact integrity failure");
      return new Response(bytes, {
        headers: {
          "Content-Type": artifact.mimeType,
          "Content-Disposition": `${artifact.mimeType === "image/png" ? "inline" : "attachment"}; filename="${artifact.id}.${artifact.relativePath.split(".").pop()}"`,
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "sandbox; default-src 'none'",
        },
      });
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      {
        status: /Forbidden|CSRF|Session|Cross-site|Origin required/.test(
          String(error),
        )
          ? 403
          : 400,
      },
    );
  }
}
export const GET = handler;
export const POST = handler;
