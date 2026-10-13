import { z } from "zod";
import { Store } from "../../db/src/index";
import { createTask } from "../../core/src/service";
import { now, redact } from "../../core/src/paths";
const issueSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  url: z.string().url(),
  state: z.object({ name: z.string(), type: z.string() }),
  relations: z.object({
    nodes: z.array(
      z.object({
        type: z.string(),
        relatedIssue: z.object({
          id: z.string(),
          identifier: z.string(),
          title: z.string(),
          state: z.object({ name: z.string(), type: z.string() }),
        }),
      }),
    ),
    pageInfo: z.object({ hasNextPage: z.boolean() }),
  }),
  inverseRelations: z.object({
    nodes: z.array(
      z.object({
        type: z.string(),
        issue: z.object({
          id: z.string(),
          identifier: z.string(),
          title: z.string(),
          state: z.object({ name: z.string(), type: z.string() }),
        }),
      }),
    ),
    pageInfo: z.object({ hasNextPage: z.boolean() }),
  }),
});
export const linearQuery = `query HubIssue($id: String!) { issue(id: $id) { id identifier title description url state { name type } relations(first: 100) { nodes { type relatedIssue { id identifier title state { name type } } } pageInfo { hasNextPage } } inverseRelations(first: 100) { nodes { type issue { id identifier title state { name type } } } pageInfo { hasNextPage } } } }`;
export function importLinearPayload(
  store: Store,
  projectId: string,
  payload: unknown,
) {
  const envelope = z
    .object({
      data: z.object({ issue: issueSchema }),
      errors: z.array(z.unknown()).optional(),
    })
    .parse(payload);
  if (envelope.errors?.length)
    throw new Error("Linear returned partial/error response");
  const issue = envelope.data.issue;
  if (
    issue.relations.pageInfo.hasNextPage ||
    issue.inverseRelations.pageInfo.hasNextPage
  )
    throw new Error(
      "Issue has more than 100 relations; narrow import scope before proceeding",
    );
  const blockers = issue.inverseRelations.nodes
    .filter((r) => r.type === "blocks")
    .map((r) => r.issue.identifier);
  const task = createTask(store, {
    projectId,
    title: issue.title,
    criteria: redact(
      issue.description || "Acceptance criteria must be supplied before Start.",
    ),
    issueKeys: [
      issue.identifier,
      ...issue.relations.nodes.map((r) => r.relatedIssue.identifier),
    ],
    mode: "qa_only",
    blockers,
  });
  store.put("change_set_issues", {
    id: task.id,
    taskId: task.id,
    issue: { ...issue, description: redact(issue.description || "") },
    importedAt: now(),
  });
  store.event(
    null,
    "linear_import",
    `Imported ${issue.identifier}; no run started; blocker revisions require explicit pins.`,
  );
  return task;
}
export async function importLinear(
  store: Store,
  projectId: string,
  issueId: string,
) {
  if (!process.env.HUB_LINEAR_TOKEN)
    throw new Error(
      "Linear is not configured. Set HUB_LINEAR_TOKEN in the local worker environment; manual tasks remain available.",
    );
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(issueId))
    throw new Error("Invalid explicit issue ID");
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: process.env.HUB_LINEAR_TOKEN,
    },
    body: JSON.stringify({ query: linearQuery, variables: { id: issueId } }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Linear HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 500000) throw new Error("Linear payload too large");
  return importLinearPayload(store, projectId, JSON.parse(text));
}
