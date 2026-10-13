# UX redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Přehlednější UI s přepínačem projektů, nastavením ve formulářích místo JSONu, jasným dalším krokem a novým vzhledem.

**Architecture:** Monolitický `apps/web/app/page.tsx` se rozdělí na malé klientské komponenty; stav navigace je v URL query přes vlastní hook nad History API. Backend dostane tři endpointy (úprava projektu, archivace, read-only kontrola repozitáře) se sdílenou validací v `packages/core/src/service.ts`. Worker se nemění.

**Tech Stack:** Next.js 16 (client components), React 19, TypeScript strict, Zod 4, better-sqlite3, Vitest, Playwright, Tailwind 4 (jen import; styly jsou ručně psané CSS tokeny).

**Spec:** `docs/superpowers/specs/2026-10-13-ux-redesign-design.md`

## Global Constraints

- UI texty anglicky; žádné camelCase názvy polí ani raw ID na první úrovni.
- Stav se nikdy nesděluje jen barvou: každý štítek má ikonu a text.
- `not_run`, `blocked`, `flaky`, `incomplete` se nikdy nezobrazí jako úspěch.
- Start běhu vždy s `Idempotency-Key`; žádná mutace přes GET; všechny mutace přes `mutate()` s `x-hub-csrf`.
- Fake provider jen v DEMO projektu a vždy s viditelným štítkem DEMO.
- Externí příkazy jen přes `execFileSync`/`git()` s argv polem.
- Nové závislosti: pouze `@fontsource-variable/figtree` (přesná verze v lockfile).
- Worker (`apps/worker/*`), gate logika a provider adaptery se nemění.
- Commity jen na výslovnou žádost uživatele (instrukce harness); plán proto commit kroky neobsahuje.

## Review Focus

1. Úprava projektu ve chvíli, kdy existuje queued/running běh → běh si drží vlastní `config.project`, nové tasky použijí novou verzi. (test v Task 1)
2. Uživatel napíše cestu s `~/` nebo s koncovým lomítkem → inspect cestu rozbalí/normalizuje a najde repozitář. (test v Task 2)
3. Příkazová řádka s uvozovkami, vícenásobnými mezerami nebo neuzavřenou uvozovkou → správné argv, resp. čitelná chyba místo tichého rozbití. (test v Task 3)
4. URL odkazuje na neexistující/archivovaný projekt nebo neexistující běh, nebo `localStorage` drží archivovaný projekt → aplikace spadne zpět na první aktivní projekt / Overview, žádná prázdná stránka. (logika `resolveNav` + test v Task 3)
5. Rozpracované změny v nastavení projektu a přepnutí projektu/sekce → potvrzení „Discard unsaved changes?“, nic se neuloží potichu. (E2E v Task 10)

---

### Task 1: Úprava a archivace projektu (backend)

**Files:**
- Modify: `packages/contracts/src/index.ts` (typ `Project` + `archived?: boolean`)
- Modify: `packages/core/src/service.ts` (extrahovat `validateProject`, přidat `updateProject`, `archiveProject`; `createTask` odmítne archivovaný projekt)
- Modify: `apps/web/app/api/v1/[...path]/route.ts` (routy `POST /projects/:id`, `POST /projects/:id/archive`)
- Test: `tests/integration/projects.test.ts`

**Interfaces:**
- Produces: `updateProject(store: Store, projectId: string, input: unknown): Project`, `archiveProject(store: Store, projectId: string, archived: boolean): Project`, `Project["archived"]?: boolean`.

- [ ] **Step 1: Failing test** — `tests/integration/projects.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../packages/db/src/index";
import { generateDemo } from "../../packages/test-fixtures/src/generate";
import { createTask, startRun, updateProject, archiveProject } from "../../packages/core/src/service";
import type { Project, Run, Task } from "../../packages/contracts/src/index";
const stores: Store[] = [];
afterEach(() => stores.splice(0).forEach((s) => s.close()));
function setup() {
  const store = new Store(mkdtempSync(join(tmpdir(), "hub-projects-")));
  stores.push(store);
  return { store, project: generateDemo(store) };
}
const editable = ({ id: _i, createdAt: _c, archived: _a, ...rest }: Project) => rest;

describe("project editing", () => {
  it("keeps identity and does not rewrite a queued run's configuration", () => {
    const { store, project } = setup();
    const task = store.list<Task>("change_sets")[0]!;
    const run = startRun(store, task.id, "projects-edit-123");
    const updated = updateProject(store, project.id, { ...editable(project), name: "Renamed product" });
    expect(updated.id).toBe(project.id);
    expect(updated.createdAt).toBe(project.createdAt);
    expect(store.get<Project>("projects", project.id)!.name).toBe("Renamed product");
    expect(store.get<Run>("runs", run.id)!.config.project.name).toBe(project.name);
  });
  it("rejects invalid edits with the same rules as registration", () => {
    const { store, project } = setup();
    const base = editable(project);
    expect(() => updateProject(store, "missing", base)).toThrow("Project not found");
    expect(() => updateProject(store, project.id, { ...base, repositories: [...base.repositories, base.repositories[0]!] })).toThrow("Duplicate repository keys");
    expect(() => updateProject(store, project.id, { ...base, surfaces: [{ key: "x", repoKey: "nope", kind: "web", cwd: "." }] })).toThrow("Unknown repository");
    expect(() => updateProject(store, project.id, { ...base, repositories: [{ ...base.repositories[0]!, sourcePath: "/definitely/missing/repo" }] })).toThrow();
  });
  it("archives without deleting history and blocks new tasks", () => {
    const { store, project } = setup();
    const task = store.list<Task>("change_sets")[0]!;
    startRun(store, task.id, "projects-archive-123");
    expect(archiveProject(store, project.id, true).archived).toBe(true);
    expect(store.list("runs")).toHaveLength(1);
    expect(() => createTask(store, { projectId: project.id, title: "x", criteria: "y" })).toThrow("archived");
    expect(archiveProject(store, project.id, false).archived).toBe(false);
  });
});
```

- [ ] **Step 2:** `pnpm exec vitest run tests/integration/projects.test.ts` → FAIL (`updateProject` neexistuje).
- [ ] **Step 3: Implementace** — v `service.ts`:
  - `function validateProject(input: unknown)` = současné tělo `createProject` od `projectSchema.parse` po `freezeReviewGuidance`, vrací projekt bez `id/createdAt`.
  - `createProject` = `store.put("projects", { ...validateProject(input), id: id(), createdAt: now() })`.
  - `updateProject`: načte existující (jinak `Project not found`), `validateProject(input)`, uloží `{ ...validated, id, createdAt, archived }`, `store.event(null, "project", "Project settings updated: " + name)`.
  - `archiveProject`: načte, uloží s `archived`, event.
  - `createTask`: po načtení projektu `if (project.archived) throw new Error("Project is archived; restore it before creating tasks")`.
  - Route: v bloku `path[0] === "projects"`: `path[2] === "archive"` → `archiveProject(s, path[1], z.object({archived: z.boolean()}).strict().parse(body).archived)`; `path[1]` → `updateProject(s, path[1], body)`; jinak create.
- [ ] **Step 4:** test → PASS; `pnpm typecheck`.

### Task 2: Kontrola repozitáře (backend)

**Files:**
- Create: `packages/adapters/src/inspect.ts`
- Modify: `apps/web/app/api/v1/[...path]/route.ts` (`POST /repositories/inspect`)
- Test: `tests/integration/projects.test.ts` (nový `describe`)

**Interfaces:**
- Produces: `inspectRepository(hubRoot: string, rawPath: string): RepositoryInspection` kde
  `RepositoryInspection = { path: string; currentBranch: string | null; branches: string[]; dirtyCount: number; suggestedKey: string }` (exportovaný typ v `packages/contracts/src/index.ts`).

- [ ] **Step 1: Failing test:**

```ts
import { inspectRepository } from "../../packages/adapters/src/inspect";
import { homedir } from "node:os";
import { mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { relative } from "node:path";
describe("repository inspection", () => {
  it("lists branches and uncommitted work of an explicit repository root", () => {
    const { store, project } = setup();
    const repo = project.repositories[0]!;
    writeFileSync(join(repo.sourcePath, "scratch.txt"), "local only");
    const result = inspectRepository(store.root, repo.sourcePath + "/");
    expect(result.path).toBe(repo.sourcePath);
    expect(result.currentBranch).toBe("main");
    expect(result.branches).toContain("main");
    expect(result.dirtyCount).toBe(1);
    expect(result.suggestedKey).toBe("fixture-monorepo");
  });
  it("expands ~ to the home directory", () => {
    const { store, project } = setup();
    const repo = project.repositories[0]!;
    const rel = relative(homedir(), repo.sourcePath);
    if (rel.startsWith("..")) return; // tmpdir outside home on this machine
    expect(inspectRepository(store.root, "~/" + rel).path).toBe(repo.sourcePath);
  });
  it("refuses non-repositories, subfolders, files, missing paths and hub internals", () => {
    const { store, project } = setup();
    const plain = join(store.root, "fixtures", "plain");
    mkdirSync(plain, { recursive: true });
    const sub = join(project.repositories[0]!.sourcePath, "nested");
    mkdirSync(sub, { recursive: true });
    const internal = join(store.root, "repos", "x");
    mkdirSync(internal, { recursive: true });
    expect(() => inspectRepository(store.root, "relative/path")).toThrow("absolute");
    expect(() => inspectRepository(store.root, "/definitely/missing")).toThrow("does not exist");
    expect(() => inspectRepository(store.root, join(project.repositories[0]!.sourcePath, "README.md"))).toThrow("not a folder");
    expect(() => inspectRepository(store.root, plain)).toThrow("not a Git repository");
    expect(() => inspectRepository(store.root, sub)).toThrow("repository root");
    expect(() => inspectRepository(store.root, internal)).toThrow("hub's own data");
    expect(realpathSync(store.root)).toBe(store.root);
  });
});
```

- [ ] **Step 2:** test → FAIL.
- [ ] **Step 3: Implementace** `inspect.ts`: expand `~`/`~/`; vyžadovat absolutní cestu (`Enter an absolute path…`); `existsSync` → `Folder does not exist`; `statSync().isDirectory()` → `This is a file, not a folder`; `realpathSync`; odmítnout `inside(join(hubRoot, d), real)` pro `repos|runs|artifacts|exports` (`This folder belongs to the hub's own data`); `git(real, ["rev-parse","--show-toplevel"])` v try → `This folder is not a Git repository`; `realpathSync(top) !== real` → `Choose the repository root: <top>`; `currentBranch = git(["branch","--show-current"]) || null`; `branches = git(["for-each-ref","--format=%(refname:short)","--count=500","refs/heads","refs/remotes"])` bez `*/HEAD`; `dirtyCount = git(["status","--porcelain"])` počet neprázdných řádků; `suggestedKey` = basename sanitizovaný na `key` regex (`[^a-zA-Z0-9_-]` → `-`, max 80, fallback `repo`).
  - Route: `if (path.join("/") === "repositories/inspect" && !read) return Response.json(inspectRepository(s.root, z.object({ path: z.string().min(1).max(1000) }).strict().parse(body).path));`
- [ ] **Step 4:** test → PASS.

### Task 3: Webové knihovny (stav, navigace, štítky, příkazová řádka)

**Files:**
- Create: `apps/web/lib/labels.ts`, `apps/web/lib/command-line.ts`, `apps/web/lib/nav.ts`, `apps/web/lib/hub.ts`
- Test: `tests/unit/web-lib.test.ts`

**Interfaces:**
- `labels.ts`: `runStatus(state: RunState): { label: string; icon: string; tone: Tone; whoseTurn: "you" | "system" | "done" | "nobody" }`, `qaStatus(s: QaStatus)`, `gateStatus(s: string)`, `verdictStatus(v)`, `severityStatus(p)`, `MODE_LABELS: Record<Task["mode"], { title: string; description: string }>`, `CAPACITY_FIELDS: { key: keyof Settings; label: string; help: string; min: number; max: number }[]`, `SURFACE_KINDS`, `COMMAND_KINDS`, `SCENARIO_KINDS`, `PROVIDER_LABELS`, `GATE_LABELS`, `NEEDS_YOU_STATES`, `type Tone = "ok" | "warn" | "bad" | "info" | "idle" | "you"`.
- `command-line.ts`: `parseCommandLine(line: string): { executable: string; args: string[] }` (throws `Unclosed quote` / `Enter a command`), `formatCommandLine(executable: string, args: string[]): string`.
- `nav.ts`: `type NavState = { project: string | "all" | null; view: View; run: string | null; tab: RunTab; section: string | null }`, `parseNav(search: string): NavState`, `serializeNav(n: NavState): string`, `resolveNav(n: NavState, projects: Project[], runs: Run[], remembered: string | null): NavState`, hook `useNav(): [NavState, (patch: Partial<NavState>, opts?: { replace?: boolean }) => void]`.
- `hub.ts`: hook `useHub(selectedRun: string | null)` → `{ state: HubState; detail: RunDetail | null; busy; error; notice; setError; setNotice; mutate(path, data, key?) ; startTask(task: Task): Promise<Run | null>; reload() }` + typy `HubState`, `RunDetail`, `ProviderView`, `DestinationView`.

- [ ] **Step 1: Failing test:**

```ts
import { describe, it, expect } from "vitest";
import { parseCommandLine, formatCommandLine } from "../../apps/web/lib/command-line";
import { parseNav, serializeNav, resolveNav } from "../../apps/web/lib/nav";
import { runStatus, qaStatus } from "../../apps/web/lib/labels";
describe("command line", () => {
  it("splits on whitespace and keeps quoted spaces", () => {
    expect(parseCommandLine('  node  scripts/qa.mjs --name "two words" \'x y\' ')).toEqual({ executable: "node", args: ["scripts/qa.mjs", "--name", "two words", "x y"] });
    expect(parseCommandLine('echo ""')).toEqual({ executable: "echo", args: [""] });
  });
  it("reports unclosed quotes and empty input", () => {
    expect(() => parseCommandLine('node "oops')).toThrow("Unclosed quote");
    expect(() => parseCommandLine("   ")).toThrow("Enter a command");
  });
  it("round-trips", () => {
    const parsed = { executable: "node", args: ["a b", "", "{{ports.backend}}"] };
    expect(parseCommandLine(formatCommandLine(parsed.executable, parsed.args))).toEqual(parsed);
  });
});
describe("navigation state", () => {
  const p = (id: string, archived = false) => ({ id, archived }) as never;
  it("parses and serializes", () => {
    const n = parseNav("?project=a&view=runs&run=r1&tab=Review");
    expect(n).toMatchObject({ project: "a", view: "runs", run: "r1", tab: "Review" });
    expect(parseNav(serializeNav(n))).toEqual(n);
    expect(parseNav("?view=bogus&tab=nope")).toMatchObject({ view: "overview", tab: "Overview" });
  });
  it("falls back from unknown or archived projects and unknown runs", () => {
    const projects = [p("a", true), p("b")];
    expect(resolveNav(parseNav("?project=zzz"), projects, [], null).project).toBe("b");
    expect(resolveNav(parseNav("?project=a"), projects, [], null).project).toBe("a"); // explicit link to archived project still opens it
    expect(resolveNav(parseNav(""), projects, [], "a").project).toBe("b"); // remembered archived project is skipped
    expect(resolveNav(parseNav("?project=all"), projects, [], null).project).toBe("all");
    expect(resolveNav(parseNav("?run=missing&view=runs"), projects, [], null).run).toBeNull();
  });
});
describe("labels", () => {
  it("never presents not-run or blocked as success", () => {
    for (const s of ["not_run", "blocked", "flaky", "skipped"] as const) expect(qaStatus(s).tone).not.toBe("ok");
    expect(runStatus("awaiting_human_qa")).toMatchObject({ label: "Ready for your QA", whoseTurn: "you" });
  });
});
```

- [ ] **Step 2:** test → FAIL. **Step 3:** implementace. **Step 4:** test → PASS, `pnpm typecheck`.

### Task 4: Vizuální základ

**Files:**
- Modify: `apps/web/app/globals.css` (kompletní přepis na tokeny), `apps/web/app/layout.tsx` (font, inline skript tématu před hydratací, `suppressHydrationWarning`), `apps/web/package.json` + `pnpm-lock.yaml` (`@fontsource-variable/figtree`)
- Create: `apps/web/components/ui.tsx`

**Interfaces:**
- `ui.tsx`: `StatusPill({ tone, icon, label })`, `RunPill({ state })`, `Button` (props `variant?: "primary" | "ghost" | "danger"`), `Card`, `Section({ title, description, actions, children })`, `Field({ label, help, error, children })`, `EmptyState({ title, body, action })`, `Disclosure({ summary, hint, defaultOpen, children })`, `Stepper({ value, min, max, onChange, label })`, `Chips({ values, onChange, placeholder, pattern })`, `Segmented({ options, value, onChange, label })`.
- Témata: `data-theme` na `<html>`, klíč `hub-theme` v `localStorage` (`light|dark|system`).

- [ ] Steps: instalace fontu (`pnpm --filter @hub/web add @fontsource-variable/figtree@<exact>`), přepis CSS podle tokenů ze spec, komponenty, `pnpm typecheck && pnpm lint`.

### Task 5: Shell, Overview, Tasks, Runs

**Files:**
- Modify: `apps/web/app/page.tsx` (tenký: `useHub` + `useNav` + výběr pohledu)
- Create: `apps/web/components/shell.tsx`, `overview.tsx`, `tasks-view.tsx`, `runs-view.tsx`

- [ ] Sidebar s přepínačem projektu (menu: projekty, All projects, New project), navigace (Overview/Tasks/Runs/Project settings), App settings, téma, stav workeru; mobil: horní lišta + rozbalovací menu.
- [ ] Overview skupiny Needs you / Running now / Ready to start; prázdné stavy (žádný projekt → Create demo project + New project; žádný task → New task).
- [ ] Tasks: karty s režimem, posledním během a Start run; Runs: řádky se štítkem, projektem (v All), filtrem stavu.
- [ ] Ověření: dev server nad demo daty, screenshot 1440/390, světlý/tmavý.

### Task 6: Detail běhu

**Files:**
- Create: `apps/web/components/run/run-detail.tsx`, `run-progress.ts` (čistá funkce `progressSteps(detail): Step[]` a `nextStep(detail, project): { title; body; action? }`), `overview-tab.tsx`, `changes-tab.tsx`, `review-tab.tsx`, `tests-tab.tsx`, `evidence-tab.tsx`, `logs-tab.tsx`
- Test: `tests/unit/web-lib.test.ts` (progress/nextStep pro `review_qa` awaiting, `qa_only`, `failed`)

- [ ] Zachovat všechny dnešní akce a formuláře (approve, publish, decisions, prepare fix ×2, manual evidence, artifact review, filtr, retry/pause/cancel/archive/refresh-baseline).
- [ ] Autor schválení/rozhodnutí předvyplněn z `localStorage` `hub-author`.

### Task 7: Nastavení projektu + průvodce

**Files:**
- Create: `apps/web/components/role-picker.tsx`, `apps/web/components/project/project-settings.tsx`, `general.tsx`, `repositories.tsx`, `ai-models.tsx`, `tests.tsx`, `advanced.tsx`, `new-project.tsx`

- [ ] Koncept projektu v lokálním stavu, savebar, `POST /projects/:id`; potvrzení při opuštění s neuloženými změnami (`useUnsavedGuard`).
- [ ] Repositories s `POST /repositories/inspect`, datalist větví, chips prefixů.
- [ ] Tests: Surfaces/Commands/Scenarios jako editovatelné seznamy; command line přes `parseCommandLine`.
- [ ] Advanced: JSON editor s parse chybou u pole; uloží se až s projektem (server validuje).
- [ ] Průvodce: Name → Repositories (min. 1 zkontrolovaný) → AI models → `POST /projects` → přepnout na nový projekt, sekce Tests.

### Task 8: Nastavení aplikace

**Files:**
- Modify: `apps/web/components/settings.tsx` → nahradit `apps/web/components/app-settings.tsx`

- [ ] Sekce dle spec; Capacity přes `CAPACITY_FIELDS` a `Stepper`; Models tabulka; Default models přes `RolePicker`; ukládání přes jeden `POST /settings` (celý objekt); Archived projects s Restore.

### Task 9: Nový task

**Files:**
- Modify: `apps/web/components/task-form.tsx`

- [ ] Write it / From Linear; režimy jako karty; refs s datalistem větví (inspect jednou při otevření pro každý repozitář, chyba = jen bez nabídky); AI řádek + RolePicker; More options (limity, dependency pins jako řádky, risky approval, DEMO scénář); souhrn; Save for later / Save and start run (pořadí dle seed).

### Task 10: E2E, dokumentace, úplné ověření

**Files:**
- Modify: `tests/e2e/hub.spec.ts`
- Modify: `IMPLEMENTATION_STATUS.md`, `README.md`, `docs/ONBOARDING.md`

- [ ] Přepsat selektory (nav „Overview/Tasks/Runs“, štítky, „Save and start run“, „Approve this version“ atd.).
- [ ] Nový E2E: New project wizard nad druhou kopií fixture repozitáře (inspect → registrace → přepnutí), úprava názvu v Project settings + Discard guard.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`; screenshoty světlý/tmavý 1440/390.
- [ ] `IMPLEMENTATION_STATUS.md`: nový milník „UX redesign“ s rozlišením implementováno / otestováno / neověřeno.
