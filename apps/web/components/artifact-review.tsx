import type { Artifact } from "../../../packages/contracts/src/index";
export function ArtifactReview({
  artifact,
  busy,
  onReview,
}: {
  artifact: Artifact;
  busy: boolean;
  onReview: (id: string, value: unknown) => Promise<unknown>;
}) {
  return (
    <details>
      <summary>
        Review for export · {artifact.sensitivity.replaceAll("_", " ")}
      </summary>
      <p>
        Confirm that this exact file contains only synthetic test data. Token
        and archive checks still run before export.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void onReview(artifact.id, {
            snapshotId: artifact.snapshotId,
            sha256: artifact.sha256,
            author: f.get("author"),
            reason: f.get("reason"),
            synthetic: true,
          });
        }}
      >
        <label>
          Reviewer
          <input name="author" required maxLength={100} />
        </label>
        <label>
          Review notes
          <textarea name="reason" minLength={5} maxLength={3000} required />
        </label>
        <label className="checkbox">
          <input type="checkbox" required />I inspected this file; it contains
          only synthetic data.
        </label>
        <button disabled={busy}>Approve file for export</button>
      </form>
    </details>
  );
}
