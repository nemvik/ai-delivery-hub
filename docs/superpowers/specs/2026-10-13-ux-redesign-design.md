# UX redesign AI Delivery Hub — návrh

**Datum:** 13. 10. 2026 · **Stav:** schváleno uživatelem · **Vizuální podoba:** artifact „Delivery Hub Redesign“ (mockupy)

## Cíl

Aplikace má být přehledná a nastavení intuitivní. Uživatel (technicky zdatný, jediný operátor) pracuje s více projekty, nechce psát JSON a potřebuje na každé obrazovce vidět, co má udělat dál. Bezpečnostní pravidla ze `SPEC.md` a `AGENTS.md` ani logika workeru se nemění.

## Rozhodnutí uživatele

| Otázka | Volba |
|---|---|
| Jazyk UI | Angličtina, srozumitelněji formulovaná |
| Kdo nastavuje | Hlavně uživatel sám (technický, chce pohodlí) |
| Více projektů | Přepínač aktivního projektu v postranním panelu + „All projects“ |
| Formuláře | Běžné části jako formuláře; runtime služby, native, review skills/context, exclusive resources a required test paths jako validovaný JSON v sekci Advanced |
| Vzhled | Odstranit technický šum, ukázat další krok, přátelštější vzhled |
| Save and start | Ano, v dialogu nového tasku (u opravných tasků z nálezů zůstává primární „Save“) |
| Výchozí stránka | Overview |
| Odebrání projektu | Archivace (skrytí), žádné mazání |
| Písmo | `@fontsource-variable/figtree` přibalené lokálně (offline) |

## Architektura (přístup A)

- `apps/web/app/page.tsx` se rozdělí na malé komponenty. Žádné nové Next.js routy.
- Stav navigace je v URL query: `?project=<id|all>&view=<overview|tasks|runs|project|settings>&run=<id>&tab=<tab>&section=<section>`. Funguje Zpět, obnovení i odkaz. Poslední zvolený projekt se pamatuje v `localStorage` (s try/catch).
- Data: dosavadní polling `/api/v1/state` + SSE pro detail běhu se přesune do hooku `useHub()`.

### Struktura souborů

```text
apps/web/lib/
  hub.ts            useHub(): state, detail, csrf, mutate, busy, error/notice
  nav.ts            useNav(): čtení/zápis URL stavu
  labels.ts         stavy → štítek/ikona/tón; názvy nastavení; režimy
  command-line.ts   rozklad příkazové řádky na argv (uvozovky), zpětné složení
apps/web/components/
  ui.tsx            StatusPill, Field, Section, Card, Button, Stepper, EmptyState, Disclosure
  shell.tsx         postranní panel, přepínač projektu, stav workeru, téma
  overview.tsx      Needs you / Running now / Ready to start
  tasks-view.tsx    seznam tasků (filtr projektu)
  runs-view.tsx     seznam běhů (filtr projektu a stavu)
  run/              detail běhu: header + next step + progress, záložky Overview/Changes/Review/Tests/Evidence/Logs
  project/          nastavení projektu: General, Repositories, AI models, Tests, Advanced; průvodce novým projektem
  app-settings.tsx  AI connections, Models, Default models, Capacity, Storage, Report folders, Linear
  role-picker.tsx   výběr provider/model/effort/timeout (sdílený)
  task-form.tsx     nový task (Write it / From Linear), Save and start
  artifact-review.tsx (beze změny chování)
```

## Navigace a přehled

- Sidebar: značka, přepínač projektu (iniciála s barvou, název, počet repozitářů; v menu projekty, „All projects“, „New project“), navigace Overview · Tasks · Runs · Project settings, dole App settings, přepínač tématu, stav workeru („Worker running · N of M slots busy“ / „Worker offline“).
- Overview: tři skupiny — **Needs you** (`awaiting_human_qa`, `needs_input`, `blocked`, `failed`, `interrupted`, `paused`), **Running now** (`running`, `queued` s důvodem), **Ready to start** (tasky bez běhu). Prázdný stav provede založením demo projektu nebo nového projektu.
- „All projects“ zobrazí vše; řádky pak nesou název projektu. Archivovaný projekt zmizí z přepínače, jde zobrazit přes „Show archived“ v App settings a vrátit.
- Mapování stavů (ikona + text, nikdy jen barva):

| Stav | Štítek | Tón |
|---|---|---|
| queued | Waiting in queue (+ důvod) | idle |
| running | Running (+ aktuální krok) | info |
| awaiting_human_qa | Ready for your QA | you |
| needs_input | Needs your input | warn |
| blocked | Blocked (+ důvod) | warn |
| paused | Paused | idle |
| interrupted | Interrupted | warn |
| failed | Failed | bad |
| cancelled | Cancelled | idle |
| verified | Verified | ok |

Gate a QA stavy (`passed/failed/blocked/not_run/skipped/flaky`, `pass/changes_requested/incomplete`, P0–P3) mají vlastní čitelné štítky; `not_run`, `blocked` a `flaky` se nikdy nezobrazí jako úspěch.

## Detail běhu

- Hlavička: drobečková navigace, název, stavový štítek, jednořádkové shrnutí (režim, čas startu, počet repozitářů, reviewer), menu akcí (Pause, Cancel, Retry as new run, Check baseline freshness, Archive) podle stavu.
- Box **Next step** s jedním konkrétním krokem odvozeným ze stavu (např. „Check the evidence and approve this version“, „Decide on the review findings“, „Fix the failing tests“).
- Průběh: Prepare → Implementation (jen `implement_review_qa`) → Code review (ne v `qa_only`, tam text „Code review is not part of this run“) → Tests → Your QA → Verified; odvozeno z kroků, review kol, výsledků a stavu.
- Overview záložka: checklist gates s lidskými názvy (Repository checks, Code review, Web & integration tests, Mobile app tests, Evidence integrity, Your approval), akceptační kritéria, formulář schválení a publikování; **Technical details** (snapshot, SHA, requested/actual model, procesy, publikace) sbalené.
- Jméno autora pro schválení a rozhodnutí se pamatuje v `localStorage`.
- Záložky Changes/Review/Tests/Evidence/Logs zachovávají dnešní funkce (decisions, Accept findings & prepare fix, Prepare fix from QA findings, manuální důkazy, Review for export, filtr důkazů, log).

## Nastavení projektu

- Sekce: **General** (název, přepínače „Allow network access“ a „Allow package installs“, archivace), **Repositories**, **AI models**, **Tests** (Surfaces, Commands, Scenarios), **Advanced** (JSON pro `runtime`, `native`, `reviewSkills`, `reviewContext`, `exclusiveResources`, `requiredTestPaths`, `onboardingNotes`).
- Editace probíhá na lokálním konceptu projektu; spodní lišta „Unsaved changes · Runs that already started keep their own copy of the settings“ s Discard / Save project. Uloží se celý projekt přes `POST /projects/:id`; chyba validace se zobrazí u lišty.
- Repositories: karta pro každý repozitář. Přidání/úprava: cesta → **Check** (`/repositories/inspect`) → výsledek (Git kořen, aktuální větev, počet větví), název navržený ze složky, baseline z nabídky větví (datalist, lze psát), Linear prefixy jako štítky.
- AI models: implementer a reviewer přes sdílený `RolePicker` (provider segmentovaně, model z katalogu nebo vlastní, effort z `effortOptions` katalogu nebo volný text, limit v minutách). „Use app default“ = role se do projektu neuloží.
- Commands: id, repozitář, příkazová řádka rozložená na argv (náhled jako štítky, bez shellu), typ (Check / Test suite / Build / Start service), fáze (Repository checks / QA), složka, limit, report path (u suite), env refs, artefakty (pokročilé, JSON pole).
- Surfaces: key, repozitář, druh (Web, API, iOS app, Android app, Library), složka.
- Scenarios: id, název, povinný, druh, surfaces, očekávané chování, ověřující suite command.
- **Nový projekt**: průvodce ve 3 krocích — Name → Repositories → AI models. Vytvoří projekt přes `POST /projects` a přepne na něj.

## Nastavení aplikace

- **AI connections**: karty Codex CLI a Claude Code se stavem (Ready / Not verified / Problem / Not checked), verzí, přihlášením, problémy; **Check installation** (doctor) a **Send test prompt…** (model z katalogu nebo vlastní, effort, výslovné upozornění na spotřebu účtu).
- **Models**: tabulka provider · model ID · effort štítky · stav ověření; přidat/odebrat řádek.
- **Default models**: `RolePicker` pro implementer/reviewer.
- **Capacity**: lidské názvy + nápověda + stepper s rozsahem ze schématu (viz tabulka v artifactu).
- **Storage**: „Keep evidence for N days“, „Evidence storage limit (GB)“, využití, kandidáti na úklid s tlačítkem.
- **Report folders**: seznam schválených složek + formulář.
- **Linear**: zda je `HUB_LINEAR_TOKEN` nastavený (z `/state.linearConfigured`); samotný import je v dialogu nového tasku.
- **Activity**: poslední integrační joby a notices (sbalené).
- **Archived projects**: seznam s „Restore“.

## Nový task

- Dialog: hlavička s projektem, přepínač **Write it / From Linear**.
- Write it: Title, „What must be true when it's done“ (criteria), linked issues (štítky), režim jako 3 karty, „Which code?“ ref pro každý repozitář (datalist větví z inspect, předvyplněno baseline), AI řádek se shrnutím a „Change“ (rozbalí `RolePicker`), **More options** (max reviews, max minutes, dependency pins jako řádky issue/repo/commit, risky-change approval, DEMO scénář u demo projektu), souhrn „Starting will…“.
- Tlačítka: **Save for later** a **Save and start run** (opravné tasky: **Save** primární, **Save and start run** sekundární). Start používá idempotency key jako dnes.
- From Linear: issue ID → import (read-only, nic nespouští), stav jobu.

## Vzhled

- Tokeny v `globals.css` (světlé + tmavé přes `prefers-color-scheme` a `data-theme` na `<html>`, přepínač pamatovaný v `localStorage`).
- Paleta: pozadí #F3F5F1, plocha #FFFFFF, text #17201C, akcent #1C6E52; sémantické ok/warn/bad/info/idle; tmavá varianta dle artifactu.
- Písmo Figtree (lokálně), JetBrains Mono nahrazeno systémovým monospace (`ui-monospace`) — bez další závislosti.
- Pryč: Georgia nadpisy, monospace eyebrow štítky, slogany, „LOCAL 01 / WORKSPACE“, ID v seznamech, camelCase.
- Responzivita do 390 px (sidebar se změní na horní lištu s menu), viditelný fokus, `prefers-reduced-motion`.

## Backend

| Endpoint | Chování | Ochrana |
|---|---|---|
| `POST /api/v1/projects/:id` | Uloží upravený projekt; zachová `id`, `createdAt`, `archived`; přepočítá `sourcePath` (realpath) a `sourceIdentity`. Event do auditu. | Stejná validace jako `createProject` (sdílená funkce). Běhy mají vlastní kopii konfigurace. Git cache klíčovaná cestou. |
| `POST /api/v1/projects/:id/archive` | `{archived: boolean}` skryje/obnoví projekt. | Nic nemaže. |
| `POST /api/v1/repositories/inspect` | `{path}` → `{path, currentBranch, branches[], suggestedKey}`. | Jen čtení refů přes `git` s argv. Bez `git status` (mohl by spustit filtry z `.git/config` před potvrzením důvěry). Odmítne neexistující cestu, ne-adresář, ne-kořen repozitáře a cesty uvnitř `repos/`, `runs/`, `artifacts/`, `exports/` datového adresáře hubu (stejná kontrola i při registraci/úpravě). Session + CSRF. Max 500 větví. |

`Project` dostane volitelné pole `archived?: boolean` (mimo `projectSchema`, stejně jako `id`/`createdAt`). `createTask` odmítne archivovaný projekt.

## Testování

- Integrační (Vitest): update zachová id/createdAt a historii běhu; update odmítne duplicitní klíče, neznámý repozitář, neexistující cestu, neznámý projekt; archivace skryje/obnoví a blokuje nový task; inspect vrátí větve a dirty count pro fixture repo, odmítne ne-repozitář, podadresář repozitáře, soubor, neexistující cestu a interní složky hubu. Unit test `command-line.ts`.
- E2E (Playwright): úprava selektorů na nové názvy; nový test průvodce projektem (inspect → registrace → přepnutí) a úpravy nastavení projektu.
- Vizuální kontrola screenshoty světlý/tmavý, 1440 a 390 px.
- Na konci `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`; zápis do `IMPLEMENTATION_STATUS.md`.

## Mimo rozsah

Změny workeru, plánovače, gate logiky, providerů; nové Next.js routy; editace review skills formulářem; mazání projektů; přepínání jazyka.
