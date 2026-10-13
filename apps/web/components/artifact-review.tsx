"use client";
import { useState } from "react";
import type { Artifact } from "../../../packages/contracts/src/index";
import { rememberAuthor, rememberedAuthor } from "../lib/hub";
import { Disclosure, Field } from "./ui";

export function ArtifactReview({
  artifact,
  busy,
  onReview,
}: {
  artifact: Artifact;
  busy: boolean;
  onReview: (id: string, value: unknown) => Promise<unknown>;
}) {
  const [author, setAuthor] = useState(rememberedAuthor);
  const [reason, setReason] = useState("");
  return (
    <Disclosure
      plain
      summary="Review for export"
      hint={
        artifact.sensitivity === "restricted" ? "restricted" : "needs review"
      }
    >
      <p className="field-help">
        Confirm this exact file contains only synthetic test data. Token and
        archive checks still run before export.
      </p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          rememberAuthor(author);
          void onReview(artifact.id, {
            snapshotId: artifact.snapshotId,
            sha256: artifact.sha256,
            author,
            reason,
            synthetic: true,
          });
        }}
      >
        <Field label="Reviewer">
          {(id) => (
            <input
              id={id}
              className="input"
              required
              maxLength={100}
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          )}
        </Field>
        <Field label="Review notes">
          {(id) => (
            <textarea
              id={id}
              className="textarea"
              minLength={5}
              maxLength={3000}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
        <label className="check">
          <input type="checkbox" required />
          <span>I inspected this file; it contains only synthetic data.</span>
        </label>
        <div>
          <button className="btn btn-sm" disabled={busy}>
            Approve file for export
          </button>
        </div>
      </form>
    </Disclosure>
  );
}
