"use client";
import type { Settings, Project } from "../../../packages/contracts/src/index";
export interface ProviderView {
  id: string;
  provider: string;
  version: string | null;
  status: string;
  problems: string[];
  login: string;
  capabilities: { verifiedReadOnlyReview: boolean };
}
export interface DestinationView {
  id: string;
  name: string;
  path: string;
}
export function SettingsPanel({
  settings,
  providers,
  destinations,
  projects,
  jobs,
  notices,
  disk,
  busy,
  mutate,
}: {
  settings: Settings;
  providers: ProviderView[];
  destinations: DestinationView[];
  projects: Project[];
  jobs: { id: string; type: string; state: string }[];
  notices: { type: string; message: string }[];
  disk: { bytes: number; retention: { runId: string; bytes: number }[] };
  busy: boolean;
  mutate: (path: string, data: unknown) => Promise<unknown>;
}) {
  return (
    <>
      <div className="detail-grid">
        <section className="panel">
          <h2>Execution & retention</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const values = Object.fromEntries(
                Object.keys(settings)
                  .filter((k) => k !== "models" && k !== "defaultRoles")
                  .map((k) => [k, Number(f.get(k))]),
              );
              void mutate("settings", {
                ...values,
                models: JSON.parse(String(f.get("models") || "[]")),
                defaultRoles: JSON.parse(String(f.get("defaultRoles") || "{}")),
              });
            }}
          >
            {Object.entries(settings)
              .filter(([k]) => k !== "models" && k !== "defaultRoles")
              .map(([k, value]) => (
                <label key={k}>
                  {k}
                  <input
                    type="number"
                    name={k}
                    defaultValue={String(value)}
                    step={k === "maxArtifactGiB" ? "0.01" : "1"}
                  />
                </label>
              ))}
            <label>
              Model catalog (JSON, availability requires live test)
              <textarea
                name="models"
                rows={5}
                defaultValue={JSON.stringify(settings.models, null, 2)}
              />
            </label>
            <button className="primary" disabled={busy}>
              Save limits & models
            </button>
            <label>
              Default roles (JSON; projects and tasks can override)
              <textarea
                name="defaultRoles"
                rows={3}
                defaultValue={JSON.stringify(
                  settings.defaultRoles || {},
                  null,
                  2,
                )}
              />
            </label>
          </form>
          <p>
            {(disk.bytes / 1024 ** 2).toFixed(1)} MiB of artifacts ·{" "}
            {disk.retention.length} archived, approved runs eligible for cleanup
          </p>
          {disk.retention.map((r) => (
            <p key={r.runId}>
              <code>{r.runId}</code> · {Math.round(r.bytes / 1024)} KB
              <button
                disabled={busy}
                onClick={() =>
                  void mutate(`runs/${r.runId}/actions`, {
                    action: "cleanup-evidence",
                  })
                }
              >
                Delete expired evidence for this run
              </button>
            </p>
          ))}
        </section>
        <div className="stack">
          <section className="panel">
            <h2>Official CLI connections</h2>
            <p>
              Doctor reads version, flags and login. Test connection sends a
              synthetic smoke prompt and consumes provider usage.
            </p>
            {(["codex-cli", "claude-code-cli"] as const).map((provider) => {
              const profile = providers.find((p) => p.id === provider);
              return (
                <div className="provider" key={provider}>
                  <h3>{provider}</h3>
                  <p>
                    {profile?.version || "Not checked"} ·{" "}
                    {profile?.status || "unverified"} · login{" "}
                    {profile?.login || "unknown"}
                  </p>
                  {profile?.problems.map((p) => (
                    <p className="muted" key={p}>
                      {p}
                    </p>
                  ))}
                  <button
                    disabled={busy}
                    onClick={() =>
                      void mutate(`providers/${provider}/doctor`, {})
                    }
                  >
                    Doctor
                  </button>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void mutate(`providers/${provider}/test-connection`, {
                        provider,
                        model: f.get("model"),
                        effort: String(f.get("effort") || "") || null,
                        timeoutSeconds: 120,
                        maxTurns: null,
                      });
                    }}
                  >
                    <label>
                      Exact model ID
                      <input
                        name="model"
                        required
                        placeholder="Your available model"
                      />
                    </label>
                    <label>
                      Effort
                      <input name="effort" placeholder="Provider-specific" />
                    </label>
                    <button disabled={busy}>
                      Test connection · uses account
                    </button>
                  </form>
                </div>
              );
            })}
          </section>
          <section className="panel">
            <h2>Approved filesystem destinations</h2>
            {destinations.map((d) => (
              <p key={d.id}>
                {d.name}
                <br />
                <code>{d.path}</code>
              </p>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void mutate("destinations", {
                  name: f.get("name"),
                  path: f.get("path"),
                });
              }}
            >
              <label>
                Destination name
                <input name="name" required />
              </label>
              <label>
                Existing directory, outside sources and hub data
                <input
                  name="path"
                  required
                  placeholder="/absolute/path/to/reports"
                />
              </label>
              <button disabled={busy}>Approve destination</button>
            </form>
            <p>
              Remote internal hub API is not configured. No endpoint is assumed.
            </p>
          </section>
          <section className="panel">
            <h2>Linear · explicit read-only import</h2>
            <p>
              Set HUB_LINEAR_TOKEN in the local worker environment. It is never
              sent to agents or the browser. Import creates a task; it does not
              Start.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void mutate("integrations/linear/import", {
                  projectId: f.get("projectId"),
                  issueId: f.get("issueId"),
                });
              }}
            >
              <label>
                Project
                <select name="projectId">
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Selected issue ID
                <input name="issueId" required placeholder="TEAM-123" />
              </label>
              <button disabled={busy || !projects.length}>
                Import selected issue
              </button>
            </form>
          </section>
        </div>
      </div>
      <section className="panel integration-log">
        <h2>Integration jobs</h2>
        {jobs.map((j) => (
          <p key={j.id}>
            {j.type} · <b>{j.state}</b>
          </p>
        ))}
        {notices.map((n, i) => (
          <p key={i}>
            {n.type}: {n.message}
          </p>
        ))}
      </section>
    </>
  );
}
