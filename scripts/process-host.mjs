// The group leader remains alive until the controller has drained its whole group.
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
const manifestPath = process.argv[2];
const started = Date.now();
let terminating = false;
process.on("SIGTERM", () => {
  if (terminating) return;
  terminating = true;
});
const interval = setInterval(() => {
  if (!existsSync(manifestPath + ".go")) {
    if (Date.now() - started > 10000) process.exit(125);
    return;
  }
  clearInterval(interval);
  const m = JSON.parse(readFileSync(manifestPath, "utf8"));
  const child = spawn(m.executable, m.args, {
    cwd: m.cwd,
    env: m.env,
    stdio: ["pipe", "inherit", "inherit"],
    shell: false,
  });
  child.stdin.end(m.stdin || "");
  child.on("error", (error) => {
    console.error(error.message);
    process.exit(127);
  });
  child.on("exit", (code, signal) => {
    process.send?.({ type: "exit", code, signal });
    process.exitCode = code ?? 1;
    setInterval(() => {}, 1000);
  });
}, 20);

process.on("disconnect", () => {
  try {
    process.kill(-process.pid, "SIGTERM");
  } catch {
    /* Group already exited. */
  }
  setTimeout(() => {
    process.kill(-process.pid, "SIGKILL");
  }, 500);
});
