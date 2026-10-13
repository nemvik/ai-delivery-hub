"use client";
import type { RunDetail } from "../../lib/hub";
import { Diff, Disclosure, Pill } from "../ui";

function stats(diff: string) {
  let add = 0,
    del = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) add++;
    else if (line.startsWith("-") && !line.startsWith("---")) del++;
  }
  return { add, del };
}

export function ChangesTab({ detail }: { detail: RunDetail }) {
  const snapshot = detail.snapshot;
  if (!snapshot)
    return (
      <p className="empty-inline">
        Changes appear once the exact versions are pinned.
      </p>
    );
  return (
    <div className="stack" style={{ marginTop: 18 }}>
      <p className="muted">
        Differences between each repository’s baseline and the version this run
        tested. Changes to tests are part of the review.
      </p>
      {snapshot.repositories.map((r) => {
        const diff = snapshot.diffs[r.repoKey] || "";
        const s = stats(diff);
        return (
          <Disclosure
            key={r.repoKey}
            defaultOpen={!!diff}
            summary={
              <span className="row">
                {r.repoKey}
                {diff ? (
                  <span className="muted" style={{ fontWeight: 500 }}>
                    <span style={{ color: "var(--ok)" }}>+{s.add}</span>{" "}
                    <span style={{ color: "var(--bad)" }}>−{s.del}</span>
                  </span>
                ) : (
                  <span className="muted" style={{ fontWeight: 500 }}>
                    unchanged
                  </span>
                )}
                {r.sourceDirty && (
                  <Pill
                    tone="warn"
                    icon="alert"
                    title="Uncommitted work in your checkout was not included"
                  >
                    Uncommitted work not included
                  </Pill>
                )}
              </span>
            }
            hint={
              <span className="mono">
                {r.baselineSha.slice(0, 8)} → {r.headSha.slice(0, 8)}
              </span>
            }
          >
            {diff ? (
              <Diff text={diff} />
            ) : (
              <p className="muted">No changes against the baseline.</p>
            )}
          </Disclosure>
        );
      })}
    </div>
  );
}
