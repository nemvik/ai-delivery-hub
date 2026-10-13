import { spawn } from "node:child_process";
const mode = process.argv[2] === "start" ? "start" : "dev";
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
const children = [
  spawn(process.execPath, ["--import", "tsx", "apps/worker/main.ts"], {
    env,
    stdio: "inherit",
  }),
  spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      mode,
      "apps/web",
      "--hostname",
      "127.0.0.1",
      "--port",
      process.env.HUB_PORT || "3000",
    ],
    { env, stdio: "inherit" },
  ),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);
for (const child of children)
  child.on("exit", (code) => {
    process.exitCode = code ?? 0;
    stop();
  });
