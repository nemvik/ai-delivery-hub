"use client";
import { useState } from "react";
import type { RunDetail } from "../../lib/hub";

export function LogsTab({
  detail,
  home,
}: {
  detail: RunDetail;
  home: string | null;
}) {
  const [type, setType] = useState("all");
  const types = [...new Set(detail.events.map((e) => e.type))];
  const shown = detail.events.filter((e) => type === "all" || e.type === type);
  return (
    <div className="stack" style={{ marginTop: 18 }}>
      <div className="spread">
        <p className="muted">
          Redacted event stream. Secrets and prompts are never shown here.
        </p>
        <select
          className="select"
          style={{ width: "auto" }}
          aria-label="Show events"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="all">All events</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <pre className="log">
        {shown
          .map(
            (e) =>
              `${new Date(e.createdAt).toLocaleTimeString()}  ${e.type.padEnd(10)} ${home ? e.message.split(home).join("~") : e.message}`,
          )
          .join("\n") || "No events yet."}
      </pre>
    </div>
  );
}
