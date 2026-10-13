import { Store } from "../../packages/db/src/index";
import { Worker } from "./engine";
const store = new Store();
const worker = new Worker(store);
await worker.acquire();
console.log("Worker ready");
let stopped = false;
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    stopped = true;
  });
try {
  while (!stopped) {
    await worker.tick();
    await new Promise((r) => setTimeout(r, 200));
  }
} finally {
  await worker.stop();
  store.close();
}
