"use client";
import { useState } from "react";
import type { Hub, RunDetail } from "../../lib/hub";
import { rememberAuthor, rememberedAuthor } from "../../lib/hub";
import { ACTIVE, bytes, timeAgo } from "../../lib/labels";
import { ArtifactReview } from "../artifact-review";
import { Disclosure, Field, Pill } from "../ui";

const SOURCE_LABEL = {
  runner: "Automated",
  manual: "Manual",
  demo: "DEMO",
} as const;
const basename = (path: string) => path.split("/").pop() || path;
function kind(mime: string, path: string) {
  if (mime === "text/html") return "Report";
  if (mime === "application/json")
    return path.endsWith("report.json") ? "Data" : "JSON";
  if (mime.includes("zip")) return "Trace";
  if (mime.startsWith("video/")) return "Video";
  return (path.split(".").pop() || "File").toUpperCase();
}

function ManualEvidence({ detail, hub }: { detail: RunDetail; hub: Hub }) {
  const { run } = detail;
  const [author, setAuthor] = useState(rememberedAuthor);
  const [file, setFile] = useState<File | null>(null);
  const [scenario, setScenario] = useState(
    run.config.project.scenarios[0]?.id ?? "",
  );
  const [surface, setSurface] = useState(
    run.config.project.surfaces[0]?.key ?? "",
  );
  const [label, setLabel] = useState("manual");
  const [error, setError] = useState("");
  return (
    <Disclosure
      summary="Attach a manual screenshot"
      hint="never counts as an automated pass"
    >
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!file) return;
          const data = new Uint8Array(await file.arrayBuffer());
          if (data.length > 5 * 1024 * 1024)
            return setError("The PNG must be smaller than 5 MB.");
          setError("");
          let binary = "";
          for (const b of data) binary += String.fromCharCode(b);
          rememberAuthor(author);
          await hub.mutate(`runs/${run.id}/manual-evidence`, {
            snapshotId: run.snapshotId,
            author,
            scenarioId: scenario,
            surfaceKey: surface,
            label,
            base64: btoa(binary),
          });
        }}
      >
        <p className="field-help">
          Manual images and mobile browser viewports document what you saw. They
          never establish a native or automated pass.
        </p>
        <div className="form-grid">
          <Field label="Author">
            {(id) => (
              <input
                id={id}
                className="input"
                required
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            )}
          </Field>
          <Field label="Screenshot (PNG)" error={error}>
            {(id) => (
              <input
                id={id}
                className="input"
                type="file"
                accept="image/png"
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            )}
          </Field>
          <Field label="Scenario">
            {(id) => (
              <select
                id={id}
                className="select"
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
              >
                {run.config.project.scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Where it was taken">
            {(id) => (
              <select
                id={id}
                className="select"
                value={surface}
                onChange={(e) => setSurface(e.target.value)}
              >
                {run.config.project.surfaces.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.key}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Kind of screenshot" className="span">
            {(id) => (
              <select
                id={id}
                className="select"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              >
                <option value="manual">Manual screenshot</option>
                <option value="web/mobile viewport">
                  Web page in a mobile-sized browser
                </option>
              </select>
            )}
          </Field>
        </div>
        <div>
          <button className="btn" disabled={hub.busy}>
            Attach evidence
          </button>
        </div>
      </form>
    </Disclosure>
  );
}

export function EvidenceTab({ detail, hub }: { detail: RunDetail; hub: Hub }) {
  const { run } = detail;
  const [filter, setFilter] = useState("");
  const scenarios = new Map(
    run.config.project.scenarios.map((s) => [s.id, s.title]),
  );
  const shown = detail.artifacts.filter((a) =>
    `${a.scenarioId ?? ""} ${scenarios.get(a.scenarioId ?? "") ?? ""} ${a.surfaceKey ?? ""} ${a.relativePath}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  const canReview = !ACTIVE.includes(run.state);
  const reviewable = (a: (typeof shown)[number]) =>
    a.sensitivity !== "synthetic" &&
    a.snapshotId === run.snapshotId &&
    canReview;
  const images = shown.filter((a) => a.mimeType === "image/png");
  const files = shown.filter((a) => a.mimeType !== "image/png");
  return (
    <div className="stack-lg" style={{ marginTop: 18 }}>
      {detail.artifacts.length > 0 && (
        <div className="spread">
          <div className="input-row" style={{ maxWidth: 420, flex: 1 }}>
            <input
              className="input"
              aria-label="Filter evidence by scenario, surface or file"
              placeholder="Filter by scenario, surface or file"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <span className="muted" style={{ fontSize: "0.88rem" }}>
            No before/after comparison: no baseline evidence is configured.
          </span>
        </div>
      )}
      {!detail.artifacts.length && (
        <p className="empty-inline">
          {ACTIVE.includes(run.state)
            ? "Screenshots and reports appear here as soon as the tests produce them."
            : "This run produced no evidence files."}
        </p>
      )}
      {images.length > 0 && (
        <div className="gallery">
          {images.map((a) => {
            const url = `/api/v1/artifacts/${a.id}/content`;
            return (
              <article className="evidence" key={a.id} data-source={a.source}>
                <a
                  className="evidence-media"
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    src={url}
                    alt={`${a.surfaceKey} ${a.scenarioId} evidence`}
                  />
                </a>
                <div className="evidence-body">
                  <div className="row">
                    <Pill
                      tone={
                        a.source === "runner"
                          ? "info"
                          : a.source === "manual"
                            ? "you"
                            : "warn"
                      }
                    >
                      {SOURCE_LABEL[a.source]}
                    </Pill>
                    {a.surfaceKey && (
                      <span className="muted">{a.surfaceKey}</span>
                    )}
                  </div>
                  <h3 title={a.relativePath}>{basename(a.relativePath)}</h3>
                  {a.scenarioId && (
                    <small>{scenarios.get(a.scenarioId) ?? a.scenarioId}</small>
                  )}
                  <small>
                    {a.author} · {timeAgo(a.createdAt)} · {bytes(a.sizeBytes)}
                  </small>
                  {reviewable(a) && (
                    <ArtifactReview
                      artifact={a}
                      busy={hub.busy}
                      onReview={(id, value) =>
                        hub.mutate(`artifacts/${id}/review`, value)
                      }
                    />
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {files.length > 0 && (
        <section className="stack">
          <h2 className="block-title">Reports, traces and videos</h2>
          <div className="list">
            {files.map((a) => {
              const url = `/api/v1/artifacts/${a.id}/content`;
              return (
                <div
                  className="list-row"
                  key={a.id}
                  style={{ gridTemplateColumns: "88px minmax(0,1fr) auto" }}
                >
                  <span className="pill tone-idle">
                    {kind(a.mimeType, a.relativePath)}
                  </span>
                  <span>
                    <span className="row-title" title={a.relativePath}>
                      {basename(a.relativePath)}
                    </span>
                    <span className="row-meta">
                      <span>{SOURCE_LABEL[a.source]}</span>
                      {a.scenarioId && (
                        <span>
                          {scenarios.get(a.scenarioId) ?? a.scenarioId}
                        </span>
                      )}
                      <span>{bytes(a.sizeBytes)}</span>
                    </span>
                    {reviewable(a) && (
                      <ArtifactReview
                        artifact={a}
                        busy={hub.busy}
                        onReview={(id, value) =>
                          hub.mutate(`artifacts/${id}/review`, value)
                        }
                      />
                    )}
                  </span>
                  <a
                    className="btn btn-sm"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {a.mimeType === "text/html" || a.mimeType.includes("zip")
                      ? "Download"
                      : "Open"}
                  </a>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {run.snapshotId && <ManualEvidence detail={detail} hub={hub} />}
    </div>
  );
}
