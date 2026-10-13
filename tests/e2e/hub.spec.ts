import { test, expect, type Page } from "@playwright/test";

const status = (page: Page) => page.locator(".title-row .row-status");

async function openApp(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.getByText(/Worker running/)).toBeVisible();
}

test("automatic review skill has a reason, pinned sources and truthful missing context", async ({
  page,
}) => {
  await openApp(page);
  await page
    .getByRole("button", { name: "Project settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Repositories", exact: true }).click();
  await expect(page.getByText("Linear DEMO", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "AI models", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Automatic review skills (1)" }),
  ).toBeVisible();
  await expect(
    page.getByText("Demo review guide", { exact: true }),
  ).toBeVisible();
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
  await page.getByRole("button", { name: /^Runs/ }).click();
  await page
    .locator(".run-row")
    .filter({ hasText: "Automatic skill evidence" })
    .first()
    .click();
  await expect(status(page)).toHaveText("Needs your input", {
    timeout: 60000,
  });
  await expect(
    page.getByRole("heading", { name: "The review is incomplete" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /^Review/ }).click();
  await page.getByText("Applied review skills (1)", { exact: true }).click();
  await expect(
    page.getByText("Linked issues: DEMO-123 · Read-only analysis", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Missing context (not run): demo-missing-context", {
      exact: true,
    }),
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
  await openApp(page);
  await page.getByRole("button", { name: /^Tasks/ }).click();
  await page
    .locator(".task-row")
    .filter({ hasText: "Verify registration across the product" })
    .getByRole("button", { name: "Start run" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Verify registration across the product",
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Verify registration across the product",
    }),
  ).toBeVisible();
  await expect(status(page)).toHaveText("Ready for your QA", {
    timeout: 60000,
  });
  await expect(
    page.getByRole("heading", {
      name: "Check the evidence and approve this version",
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /^Tests/ }).click();
  await expect(page.getByText("Passed", { exact: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: /^Evidence/ }).click();
  await expect(page.getByAltText("admin registration evidence")).toBeVisible();
  await page.screenshot({
    path: "evidence/M1-browser-evidence.png",
    fullPage: true,
  });
  await page.getByText("Attach a manual screenshot").click();
  await page.getByLabel("Author", { exact: true }).fill("Browser QA reviewer");
  await page
    .getByLabel("Screenshot (PNG)")
    .setInputFiles("evidence/M1-browser-evidence.png");
  await page
    .getByRole("button", { name: "Attach evidence", exact: true })
    .click();
  await expect(
    page.locator(".evidence").filter({ hasText: "Browser QA reviewer" }),
  ).toContainText("Manual");
  await page.getByRole("tab", { name: /^Overview/ }).click();
  await page.getByLabel("Your name").fill("Browser QA reviewer");
  await page
    .getByLabel("What did you check?")
    .fill("Inspected actual registration and admin evidence in the demo.");
  await page.getByRole("button", { name: "Approve this version" }).click();
  await expect(status(page)).toHaveText("Verified");
  await page.locator(".crumb").getByRole("button", { name: "Runs" }).click();
  await page.screenshot({ path: "evidence/dashboard.png", fullPage: true });
});

const MODE_TITLES: Record<string, string> = {
  review_qa: "Review + QA",
  implement_review_qa: "Implement + review + QA",
  qa_only: "Tests only",
};

async function createTask(
  page: Page,
  title: string,
  scenario: string,
  mode: string,
) {
  await openApp(page);
  await page.getByRole("button", { name: "New task" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill(title);
  await dialog
    .getByLabel("Acceptance criteria")
    .fill("Verify the actual fixture behavior and preserve the evidence.");
  await dialog
    .getByRole("radio", {
      name: new RegExp("^" + MODE_TITLES[mode]!.replaceAll("+", "\\+")),
    })
    .check();
  await dialog.getByText("More options").click();
  await dialog
    .getByRole("combobox", { name: "DEMO fixture scenario", exact: true })
    .selectOption(scenario);
  await dialog.getByRole("button", { name: "Save and start run" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".title-row .page-title")).toHaveText(title);
}

test("manual task with a real regression stays failed and contains failure evidence", async ({
  page,
}) => {
  await createTask(page, "Browser regression fixture", "web-fail", "qa_only");
  await expect(status(page)).toHaveText("Failed", { timeout: 60000 });
  await expect(
    page.getByRole("button", { name: "Approve this version" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Fix the failing tests" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /^Tests/ }).click();
  await expect(
    page.locator('.test-row[data-scenario="registration"]'),
  ).toContainText("Failed");
  const beforeFix = await (await page.request.get("/api/v1/state")).json();
  await page
    .getByRole("button", { name: "Prepare fix from QA findings" })
    .click();
  const fixDialog = page.getByRole("dialog");
  await expect(fixDialog.getByLabel("Acceptance criteria")).toHaveValue(
    /QA failed: registration/,
  );
  await expect(
    fixDialog.getByRole("radio", { name: /^Implement \+ review \+ QA/ }),
  ).toBeChecked();
  await fixDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(fixDialog).not.toBeVisible();
  const afterFix = await (await page.request.get("/api/v1/state")).json();
  expect(afterFix.runs).toHaveLength(beforeFix.runs.length);
  expect(
    afterFix.tasks.find(
      (t: { title: string }) =>
        t.title === "Fix QA: Browser regression fixture",
    ).sourceSnapshotId,
  ).toBeTruthy();
  await page.getByRole("button", { name: /^Runs/ }).click();
  await page
    .locator(".run-row")
    .filter({ hasText: "Browser regression fixture" })
    .click();
  await page.getByRole("tab", { name: /^Evidence/ }).click();
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
  await expect(status(page)).toHaveText("Running");
  await page.getByRole("button", { name: "Pause run", exact: true }).click();
  await expect(status(page)).toHaveText("Paused");
  await page.getByRole("tab", { name: /^Logs/ }).click();
  await expect(page.locator(".log")).toContainText("pause");
  const pausedUrl = page.url();
  await page.getByRole("button", { name: "Retry as new run" }).first().click();
  await expect(page).not.toHaveURL(pausedUrl);
  await expect(status(page)).toHaveText(/Running|Waiting in queue/);
  await page.locator(".crumb").getByRole("button", { name: "Runs" }).click();
  const rows = page
    .locator(".run-row")
    .filter({ hasText: "Controlled long-running fixture" });
  await expect(rows).toHaveCount(2);
  await rows.filter({ has: page.locator('[data-state="running"]') }).click();
  await page.getByRole("button", { name: "Cancel run", exact: true }).click();
  await expect(status(page)).toHaveText("Cancelled");
});

test("new project wizard checks the folder, registers the project and guards unsaved edits", async ({
  page,
}) => {
  await openApp(page);
  const state = await (await page.request.get("/api/v1/state")).json();
  const repoPath: string = state.projects[0].repositories[0].sourcePath;
  await page.getByRole("button", { name: "Switch project" }).click();
  await page.getByRole("menuitem", { name: "New project" }).click();
  await page.getByLabel("Project name").fill("Second product");
  await page.getByRole("button", { name: "Continue" }).click();
  await page
    .getByLabel("Folder on this computer")
    .fill(repoPath + "/nested-missing");
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText("Folder does not exist")).toBeVisible();
  await page.getByLabel("Folder on this computer").fill(repoPath);
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText("Git repository found")).toBeVisible();
  await page.getByRole("button", { name: "Add repository" }).click();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await page.getByText("These are my own, trusted repositories.").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(
    page.getByRole("heading", { name: "Project settings" }),
  ).toBeVisible();
  await expect(page.getByText(/“Second product” is ready/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Switch project" }),
  ).toContainText("Second product");
  await expect(
    page.getByText("No required automated scenario yet."),
  ).toBeVisible();

  await page.getByRole("button", { name: "General", exact: true }).click();
  await page.getByLabel("Project name").fill("Second product renamed");
  await expect(
    page.getByRole("region", { name: "Unsaved changes" }),
  ).toBeVisible();
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByRole("button", { name: /^Overview/ }).click();
  await expect(
    page.getByRole("heading", { name: "Project settings" }),
  ).toBeVisible();
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Project settings" }),
  ).toBeVisible();
  await expect(page.getByLabel("Project name")).toHaveValue(
    "Second product renamed",
  );
  await page.getByRole("button", { name: "Save project" }).click();
  await expect(page.getByText(/Project saved/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Switch project" }),
  ).toContainText("Second product renamed");
  await page.getByRole("button", { name: "Archive project" }).click();
  await expect(
    page.getByText(/archived\. Its runs and evidence are kept/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Switch project" }),
  ).not.toContainText("Second product renamed");
  await page.screenshot({
    path: "evidence/project-wizard.png",
    fullPage: true,
  });
});

test("AT33 AT34 authenticated API rejects cross-origin writes and isolates report downloads", async ({
  page,
  request,
}) => {
  await openApp(page);
  expect((await request.post("/api/v1/demo", { data: {} })).status()).toBe(403);
  const csrf = await page.evaluate(
    async () => (await (await fetch("/api/v1/session")).json()).csrf as string,
  );
  const response = await page.request.post("/api/v1/demo", {
    headers: { Origin: "https://foreign.example", "x-hub-csrf": csrf },
    data: {},
  });
  expect(response.status()).toBe(403);
  const inspect = await page.request.post("/api/v1/repositories/inspect", {
    headers: { Origin: "https://foreign.example", "x-hub-csrf": csrf },
    data: { path: "/" },
  });
  expect(inspect.status()).toBe(403);
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
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: /^Tasks/ }).click();
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "evidence/mobile-dashboard.png",
    fullPage: true,
  });
});
