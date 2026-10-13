import { test, expect } from "@playwright/test";
test("automatic review skill has a reason, pinned sources and truthful missing context", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Worker online")).toBeVisible();
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByText("Automatic review skills (1)", { exact: true }).click();
  await expect(
    page.getByText("Demo review guide", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Linear: DEMO", { exact: true })).toBeVisible();
  const runId = await page.evaluate(async () => {
    const session = await (await fetch("/api/v1/session")).json();
    const state = await (await fetch("/api/v1/state")).json();
    const headers = {
      "Content-Type": "application/json",
      "x-hub-csrf": session.csrf,
    };
    const taskResponse = await fetch("/api/v1/change-sets", {
      method: "POST",
      headers,
      body: JSON.stringify({
        projectId: state.projects[0].id,
        title: "Automatic skill evidence",
        criteria: "Check the real demo contract",
        mode: "review_qa",
        issueKeys: ["DEMO-123"],
      }),
    });
    if (!taskResponse.ok) throw new Error(await taskResponse.text());
    const task = await taskResponse.json();
    const runResponse = await fetch(`/api/v1/change-sets/${task.id}/runs`, {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": "e2e-skills-" + task.id },
      body: "{}",
    });
    if (!runResponse.ok) throw new Error(await runResponse.text());
    return (await runResponse.json()).id as string;
  });
  await page.getByRole("button", { name: "Runs", exact: true }).click();
  await page
    .getByRole("button", { name: /Automatic skill evidence/ })
    .first()
    .click();
  await expect(page.locator(".page-heading .badge")).toHaveText("needs input", {
    timeout: 60000,
  });
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  await page.getByText("Applied review skills (1)", { exact: true }).click();
  await expect(
    page.getByText("Linked issues: DEMO-123 · Read-only analysis", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("NOT_RUN context: demo-missing-context", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/review-guide.md · SHA256/)).toBeVisible();
  await page.screenshot({
    path: "evidence/automatic-review-skills.png",
    fullPage: true,
  });
  const details = await page.evaluate(
    async (id) => (await fetch("/api/v1/runs/" + id)).json(),
    runId,
  );
  expect(
    details.steps.some(
      (step: { role?: string }) => step.role === "implementer",
    ),
  ).toBe(false);
});
test("AT01 AT02 real task → refresh → screenshots and stream history", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Worker online")).toBeVisible();
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await page
    .locator(".panel")
    .filter({
      has: page.getByRole("heading", {
        name: "Verify registration across the product",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Start run →" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Verify registration across the product",
    }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: /Verify registration across the product/ })
    .first()
    .click();
  await expect(page.locator(".page-heading .badge")).toHaveText(
    "awaiting human qa",
    { timeout: 60000 },
  );
  await page.getByRole("tab", { name: "Tests", exact: true }).click();
  await expect(page.getByText("passed", { exact: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: "Evidence", exact: true }).click();
  await expect(page.getByAltText("admin registration evidence")).toBeVisible();
  await page.screenshot({
    path: "evidence/M1-browser-evidence.png",
    fullPage: true,
  });
  const manual = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Attach manual evidence" }),
  });
  await manual
    .getByLabel("Author", { exact: true })
    .fill("Browser QA reviewer");
  await manual
    .getByLabel("Screenshot (PNG)")
    .setInputFiles("evidence/M1-browser-evidence.png");
  await manual
    .getByRole("button", { name: "Attach evidence", exact: true })
    .click();
  await expect(
    page.locator(".evidence").filter({ hasText: "Browser QA reviewer" }),
  ).toContainText("manual");
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page.getByLabel("Human QA author").fill("Browser QA reviewer");
  await page
    .getByLabel("Verification notes / completed manual steps")
    .fill("Inspected actual registration and admin evidence in the demo.");
  await page.getByRole("button", { name: "Approve this snapshot" }).click();
  await expect(page.locator(".page-heading .badge")).toHaveText("verified");
  await page.getByRole("button", { name: "← All runs" }).click();
  await page.screenshot({ path: "evidence/dashboard.png", fullPage: true });
});

async function createTask(
  page: import("@playwright/test").Page,
  title: string,
  scenario: string,
  mode: string,
) {
  await page.goto("/");
  await expect(page.getByText("Worker online")).toBeVisible();
  await page.getByRole("button", { name: "New task" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill(title);
  await dialog
    .getByLabel("Acceptance criteria")
    .fill("Verify the actual fixture behavior and preserve the evidence.");
  await dialog
    .getByRole("combobox", { name: "Mode", exact: true })
    .selectOption(mode);
  await dialog
    .getByRole("combobox", { name: "DEMO fixture scenario", exact: true })
    .selectOption(scenario);
  await dialog
    .getByRole("button", { name: "Save task · start separately" })
    .click();
  await expect(dialog).not.toBeVisible();
  await page
    .locator(".panel")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .getByRole("button", { name: "Start run →" })
    .click();
  await expect(page.locator(".page-heading h1")).toHaveText(title);
}

test("manual task with a real regression stays failed and contains failure evidence", async ({
  page,
}) => {
  await createTask(page, "Browser regression fixture", "web-fail", "qa_only");
  await expect(page.locator(".page-heading .badge")).toHaveText("failed", {
    timeout: 60000,
  });
  await expect(
    page.getByRole("button", { name: "Approve this snapshot" }),
  ).not.toBeVisible();
  await page.getByRole("tab", { name: "Tests", exact: true }).click();
  await expect(
    page.locator(".test-row").filter({
      has: page.getByRole("heading", { name: "registration", exact: true }),
    }),
  ).toContainText("failed");
  const beforeFix = await (await page.request.get("/api/v1/state")).json();
  await page
    .getByRole("button", { name: "Prepare fix from QA findings" })
    .click();
  const fixDialog = page.getByRole("dialog");
  await expect(fixDialog.getByLabel("Acceptance criteria")).toHaveValue(
    /QA failed: registration/,
  );
  await expect(
    fixDialog.getByRole("combobox", { name: "Mode", exact: true }),
  ).toHaveValue("implement_review_qa");
  await fixDialog
    .getByRole("button", { name: "Save task · start separately" })
    .click();
  await expect(fixDialog).not.toBeVisible();
  const afterFix = await (await page.request.get("/api/v1/state")).json();
  expect(afterFix.runs).toHaveLength(beforeFix.runs.length);
  expect(
    afterFix.tasks.find(
      (t: { title: string }) =>
        t.title === "Fix QA: Browser regression fixture",
    ).sourceSnapshotId,
  ).toBeTruthy();
  await page.getByRole("button", { name: "Runs", exact: true }).click();
  await page
    .locator(".run-row")
    .filter({ hasText: "Browser regression fixture" })
    .click();
  await page.getByRole("tab", { name: "Evidence", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "failure.png", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "evidence/failure-evidence.png",
    fullPage: true,
  });
});

test("pause and retry create distinct runs, and cancel stops the new process", async ({
  page,
}) => {
  await createTask(
    page,
    "Controlled long-running fixture",
    "hang",
    "implement_review_qa",
  );
  await expect(page.locator(".page-heading .badge")).toHaveText("running");
  await page.getByRole("button", { name: "Pause run", exact: true }).click();
  await expect(page.locator(".page-heading .badge")).toHaveText("paused");
  await page.getByRole("tab", { name: "Logs", exact: true }).click();
  await expect(page.locator(".logs")).toContainText("pause");
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Retry as new run" }).click();
  await page.getByRole("button", { name: "← All runs" }).click();
  const rows = page
    .locator(".run-row")
    .filter({ hasText: "Controlled long-running fixture" });
  await expect(rows).toHaveCount(2);
  await rows.filter({ has: page.locator(".badge.running") }).click();
  await page.getByRole("button", { name: "Cancel run", exact: true }).click();
  await expect(page.locator(".page-heading .badge")).toHaveText("cancelled");
});

test("AT33 AT34 authenticated API rejects cross-origin writes and isolates report downloads", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.getByText("Worker online")).toBeVisible();
  expect((await request.post("/api/v1/demo", { data: {} })).status()).toBe(403);
  const csrf = await page.evaluate(
    async () => (await (await fetch("/api/v1/session")).json()).csrf as string,
  );
  const response = await page.request.post("/api/v1/demo", {
    headers: { Origin: "https://foreign.example", "x-hub-csrf": csrf },
    data: {},
  });
  expect(response.status()).toBe(403);
  const state = await (await page.request.get("/api/v1/state")).json();
  const completed = state.runs.find(
    (r: { snapshotId: string | null }) => r.snapshotId,
  );
  expect(completed).toBeTruthy();
  const detail = await (
    await page.request.get("/api/v1/runs/" + completed.id)
  ).json();
  const html = detail.artifacts.find(
    (a: { mimeType: string }) => a.mimeType === "text/html",
  );
  const content = await page.request.get(
    "/api/v1/artifacts/" + html.id + "/content",
  );
  expect(content.headers()["content-disposition"]).toContain("attachment");
  expect(content.headers()["content-security-policy"]).toContain("sandbox");
  expect(content.headers()["x-content-type-options"]).toBe("nosniff");
  const events = await page.evaluate(async (runId: string) => {
    const response = await fetch(`/api/v1/runs/${runId}/events?after=1`);
    const reader = response.body!.getReader();
    const data = await reader.read();
    await reader.cancel();
    return new TextDecoder().decode(data.value);
  }, completed.id);
  expect(events).toContain("data:");
  expect(events).not.toMatch(/id: 1\n/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Work, deliberately started." }),
  ).toBeVisible();
  await page.screenshot({
    path: "evidence/mobile-dashboard.png",
    fullPage: true,
  });
});
