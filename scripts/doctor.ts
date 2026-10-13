import { Store } from "../packages/db/src/index";
import { doctor } from "../packages/adapters/src/providers";
const store = new Store();
for (const provider of ["codex-cli", "claude-code-cli"] as const)
  console.log(JSON.stringify(doctor(provider, store), null, 2));
console.log(
  "Live inference was NOT_RUN. Use Settings → Test connection explicitly.",
);
store.close();
