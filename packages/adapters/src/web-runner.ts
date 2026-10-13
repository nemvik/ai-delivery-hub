import { chromium, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const [baseUrl, output, runId, snapshotId] = process.argv.slice(2) as [
  string,
  string,
  string,
  string,
];
mkdirSync(output, { recursive: true });
const start = Date.now();
const result = {
  runId,
  snapshotId,
  status: "failed",
  observed: "",
  assertions: [] as { description: string; passed: boolean }[],
  files: [] as { name: string; surface: string }[],
  durationMs: 0,
};
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: join(output, "video") },
});
await context.tracing.start({
  screenshots: true,
  snapshots: true,
  sources: false,
});
const page = await context.newPage();
try {
  const health = await page.request.get(baseUrl + "/health");
  expect((await health.json()).runId).toBe(runId);
  await page.goto(baseUrl + "/live");
  const name = "Demo guest " + runId.slice(0, 8);
  await page.getByLabel("Your name").fill(name);
  const registrationResponse = page.waitForResponse(
    (response) =>
      response.url() === baseUrl + "/api/participants" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Registered: " + name);
  const participantId = await page.getByRole("status").getAttribute("data-id");
  expect(participantId).toBeTruthy();
  const registration = await registrationResponse;
  expect(registration.ok()).toBe(true);
  expect(await registration.json()).toEqual({
    id: participantId,
    displayName: name,
  });
  const participants = await page.request.get(baseUrl + "/api/participants");
  expect(participants.ok()).toBe(true);
  expect(await participants.json()).toContainEqual({
    id: participantId,
    name,
    displayName: name,
  });
  result.assertions.push({
    description:
      "POST and GET participant responses preserve displayName and legacy name",
    passed: true,
  });
  await page.screenshot({ path: join(output, "live.png"), fullPage: true });
  result.files.push({ name: "live.png", surface: "live" });
  result.assertions.push({
    description: "Registration accepted by the backend",
    passed: true,
  });
  await page.goto(baseUrl + "/admin");
  await expect(page.locator(`[data-id="${participantId}"]`)).toHaveText(name, {
    timeout: 3000,
  });
  await page.screenshot({ path: join(output, "admin.png"), fullPage: true });
  result.files.push({ name: "admin.png", surface: "admin" });
  result.assertions.push({
    description: "Same participant ID and name rendered in admin",
    passed: true,
  });
  result.status = "passed";
  result.observed = `Participant ${participantId} is visible on both surfaces.`;
} catch (error) {
  result.observed = String(error).slice(0, 3000);
  result.assertions.push({
    description: "Cross-surface registration",
    passed: false,
  });
  await page
    .screenshot({ path: join(output, "failure.png"), fullPage: true })
    .catch(() => {});
  result.files.push({ name: "failure.png", surface: "admin" });
} finally {
  await context.tracing.stop({ path: join(output, "trace.zip") });
  await context.close();
  const videoPath = await page.video()?.path();
  if (videoPath)
    result.files.push({
      name: "video/" + videoPath.split("/").at(-1)!,
      surface: "web",
    });
  await browser.close();
  result.files.push({ name: "trace.zip", surface: "web" });
  result.durationMs = Date.now() - start;
  writeFileSync(join(output, "result.json"), JSON.stringify(result, null, 2));
}
process.exitCode = result.status === "passed" ? 0 : 1;
