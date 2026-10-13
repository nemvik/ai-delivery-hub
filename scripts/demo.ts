import { Store } from "../packages/db/src/index";
import { generateDemo } from "../packages/test-fixtures/src/generate";
const store = new Store();
const p = generateDemo(store);
console.log(
  `DEMO: ${p.name}\nData: ${store.root}\nRun pnpm dev, then open http://127.0.0.1:3000 and start the demo task.`,
);
store.close();
