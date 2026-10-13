# Stav implementace

Veřejný repozitář obsahuje zdroje, testy a tento souhrn. Odkazy do `evidence/`, na konkrétní lokální profil a detailní `docs/HAPPENEE.md` jsou místní auditní záznamy; kvůli firemním a osobním údajům nejsou verzované. [Postup vytvoření vlastního profilu](docs/HAPPENEE_SETUP.md) je součástí repozitáře. Při následném předání přes Git vznikl první commit aplikace; dřívější poznámky o chybějících Git metadatech popisují stav při implementaci.

M1–M7 jsou implementované. Konečné navazující ověření z 13. 10. 2026: **skutečný Codex CLI smoke a review_qa PASS nad demo repozitáři, 46/46 unit/integračních testů, 5/5 produkčních browser E2E, lint, typecheck a build PASS.** Happenee profil a automatické review skills jsou připravené. Firemní QA, Claude inference, native a Linear live zůstávají výslovně neověřené. Historické výsledky předání z 12. 10. jsou zachované níže.

Zdrojový balíček při zahájení neměl Git metadata ani existující aplikaci; původní předání proto uvádělo commit aplikace jako N/A. Původní specifikace a kontrakty zůstávají zachované. SHA skutečných demo repozitářů jsou v reportu. Zdrojový stav původního předání je identifikovaný souborem `evidence/source-sha256.json`.

Publikační kontrola 13. 10. 2026: lokální profily, firemní inventář a běhová evidence jsou ignorované; veřejný onboarding popisuje jejich vytvoření. Test AT29 používá vlastní syntetický PNG místo screenshotu z předchozího E2E. Nad čistou kopií obsahu připraveného pro Git proběhly `eslint .`, `tsc --noEmit` a `vitest run`: PASS, 46/46 testů (9 souborů, 27.85 s), se sdílenými již instalovanými závislostmi a Node 22.23.1. Nová instalace závislostí se při této kontrole neprováděla.

## Kritéria dokončení

Funkční lokální UI + samostatný worker; durable fronta a SSE; skutečné izolované Git fixtures; řízené review/QA; skutečné Playwright screenshoty; pravdivé gates; export s integritou; odmítnutí neautorizovaných mutací a bezpečná obnova. Firemní integrace pouze přes explicitní onboarding.

## Milníky

| Milník | Implementace | Ověření |
|---|---|---|
| M1 | hotovo: web, worker, SQLite/fronta/SSE, skutečné web QA | PASS; M1 4/4 + browser E2E |
| M2 | hotovo: multi-repo SHA, bare caches/worktrees, checkpointy | PASS; M2 + Git hardening |
| M3 | hotovo: CLI adaptery, doctor, modely, read-only review | Codex live smoke + review_qa PASS; Claude inference NOT_RUN |
| M4 | hotovo: tři režimy, řízený loop, gates a navazující opravy | PASS; M4 4/4, skutečné kontraktní assertions |
| M5 | hotovo: locks, isolation, cancel/pause/retry a recovery | PASS; M5 6/6 + skutečné zabití workeru v hardening testu |
| M6 | hotovo: evidence, native adapter, report a filesystem export | PASS místní export/browser; native live NOT_RUN |
| M7 | hotovo: Linear adapter, onboarding, session/CSRF, hardening | PASS fixtures a lokální E2E; Linear live/pilot NOT_RUN |

## Zjištěné nástroje

Node 22.23.1, pnpm 11.24.0, Git 2.54.0 (Apple Git-157), Next.js 16.4.0, React 19.3.0, TypeScript 6.0.3. Codex CLI 0.162.1: přihlášení a skutečný protokol/read-only smoke ověřeny. Requested model `gpt-6.1-sol`, effort `low`; actual model CLI nehlásí, zůstává `unknown`. Claude Code 2.1.296: přihlášení chybí. Maestro není v PATH. Závislosti jsou připnuté lockfile; žádná globální instalace ani změna CLI konfigurace. Původní doctor: [provider-doctor-final.jsonl](evidence/provider-doctor-final.jsonl); nový [live smoke](evidence/codex-live/smoke.json).

## Navazující milníky — 13. 10. 2026

**M3 live:** první skutečný Codex proces dokončil schema JSON a OS odmítl zápis, ale parser chybně odmítl předchozí textový komentář. Regresní test z reálného JSONL nejdřív selhal, pak prošel: [před](evidence/codex-parser-before.txt), [po](evidence/codex-parser-after.txt). Parser zpracovává poslední dokončenou agent_message, poškozené finále stále odmítá. M3 6/6 PASS, skutečný smoke PASS. Nový read-only prompt odděluje controller provenance, review kontext a následné QA; nepředstírá testy spuštěné modelem.

**M1/M4 živé review:** první run `f5ba0a87-1746-49d2-87b3-ce19411d0885` skončil `needs_input`, `changes_requested`. Reviewer našel reálný P2: GET participants nevracel `displayName`, přestože kontrakty a POST ho používaly. Přidány skutečné Playwright assertions POST/GET payloadu, před opravou FAIL a po opravě M1 4/4 PASS: [před](evidence/demo-contract-before.txt), [po](evidence/demo-contract-after.txt). Oprava zachovává legacy `name`. Měnil se pouze zdroj demo fixture a její lokální checkpoint: [SHA/diff](evidence/codex-live/demo-fixture-fix.json). Historické runy/reporty zůstaly neměnné.

Opakovaný skutečný run `ac23cb80-8941-4799-9b8d-f7201b4b477e`, snapshot `c5988d87-3401-49ab-8cc6-5cbf99323d88`: reviewer PASS, 0 findings, skutečné registration a contract PASS, native NOT_RUN, bez implementera, `awaiting_human_qa`. [Výstup](evidence/codex-live-review-after.txt), [historická data](evidence/codex-live/review-qa-ac23cb80-8941-4799-9b8d-f7201b4b477e.json).

**Happenee + skills:** zaregistrovány explicitně vybrané tři repo roots, MOB/SERV/PLAT, 10 surfaces, CLI defaulty a oba existující review skills v read-only adaptéru. SHA/content pravidel se zmrazí při Start; selection a missing context jsou v UI/reportu. Company OS/KB/technické docs nejsou onboardované a nemohou vytvořit úplný PASS. Nezávislé review vedlo k opravám legacy defaultů, prázdného textu a kontroly source identity při opakované registraci. Doplněno explicitní vypnutí web search a strict config; finální review těchto oprav nemá nový produkční nález. [Profil a další vhodné skills](docs/HAPPENEE.md), [registrace](evidence/happenee-register.txt), [idempotentní opakování](evidence/happenee-reregister.txt), [nezměněné HEAD/status všech tří checkoutů](evidence/happenee/source-checkouts-unchanged.json). Firemní run count = 0.

### Konečné důkazy navazujícího ověření

| Příkaz / kontrola | Skutečný výsledek | Důkaz |
|---|---|---|
| `pnpm lint` | PASS | [log](evidence/live-final-lint.txt) |
| `pnpm typecheck` | PASS | [log](evidence/live-final-typecheck.txt) |
| `pnpm test` | PASS 46/46, 9 souborů, 28.65 s | [log](evidence/live-final-tests.txt) |
| `pnpm build` | PASS | [log](evidence/live-final-build.txt) |
| `HUB_E2E_PRODUCTION=1 pnpm test:e2e` | PASS 5/5, 22.6 s | [log](evidence/live-final-e2e.txt), [skills UI](evidence/automatic-review-skills.png) |
| `pnpm exec tsx scripts/verify-codex.ts` | Skutečný CLI smoke + review_qa PASS, konečné argv se strict config a vypnutým web search | [log](evidence/codex-live-final.txt), [smoke](evidence/codex-live/smoke.json) |
| `node --import tsx scripts/prepare-happenee.ts` | Read-only roots/refs/skill hashes ověřeny, konfigurace připravena | [log](evidence/happenee-prepare.txt), [inventory](evidence/happenee/onboarding-inventory.json) |
| `HUB_DATA_DIR="$PWD/.hub-data" node --import tsx scripts/onboard-project.ts config/happenee.project.json` | Registrace a opakování PASS, žádný Start | [log](evidence/happenee-reregister.txt) |

Finální živý run **`651fece3-14af-4edd-a58d-a92c6692cb56`**, snapshot **`73061dd0-baa5-4cb0-a9a9-9b7346169c95`**. Requested `gpt-6.1-sol/low`, actual **unknown**; 1 reviewer, 0 implementerů, 0 findings, coverage gaps 0. `registration` PASS včetně reálného POST/GET contract assertion, `contract` PASS, `native` NOT_RUN (optional). Review/integration/evidence gates PASS; stav **awaiting_human_qa**, lidské schválení nebylo uděleno. [Report HTML](evidence/codex-live/final-report.html), [úplná data](evidence/codex-live/review-qa.json), [procesy](evidence/codex-live/final-process-evidence.json), [nezměněné demo zdroje po review](evidence/codex-live/source-unchanged-after-review.json).

Nový browser test ověřuje skutečnou automatickou aktivaci DEMO skillu v subprocess workflow a zobrazení verze/důvodu/missing context. První společný E2E běh odhalil závislost starého testu na pořadí tasků; výběr byl zpřesněn na konkrétní task, [původní selhání](evidence/live-e2e-before-task-selector-fix.txt). Live test firemních skills nad skutečným Happenee PR a firemními dokumenty zůstává NOT_RUN.

Následující M1–M6 záznamy zachycují postupné průchody; konečný stav a opravené regrese jsou v závěrečných tabulkách.

## M1 — výsledek

Implementováno: Next.js UI/API, SQLite WAL + migrační verze, durable idempotentní command queue, SSE replay, oddělený worker, vlastní process groups, cancel, skutečný demo HTTP server, Playwright registrace → admin, PNG + trace s run/snapshot metadaty.

Ověřeno: `pnpm typecheck` PASS; `pnpm test -- tests/integration/m1.test.ts` PASS (4/4, 12. 10. 2026). Ověřen double-start, druhý worker, skutečně úspěšný a skutečně neúspěšný browser assertion; první pokus v sandboxu byl blokován EPERM loopback bind, opakování s povoleným lokálním serverem prošlo. Browser E2E UI se nyní spouští. LLM nebyl použit.

## M2 — výsledek

Implementováno: tři samostatné Git fixtures, schválené source paths, SHA pins při Start, vlastní bare cache bez hardlinků, unikátní branches/worktrees, Git locks, checkpointy včetně additions/deletions, chráněný cleanup, sanitizovaný read-only export a diff per repo.

Ověřeno: `pnpm test -- tests/integration/m1.test.ts tests/integration/m2.test.ts` PASS 5/5; výstup `evidence/M2-tests.txt`. AT03–AT07 mají integrační assertions pro izolaci, dirty source, úplný diff, manifest ownership a branch drift. První UI E2E FAIL kvůli přístupnému názvu navigace; oprava přidává přesné aria-label, žádný QA výsledek tím nebyl povýšen na PASS.

## M1 UI E2E a M3 — výsledek

`pnpm test:e2e` PASS 1/1 (8.3 s). Důkazy: `evidence/M1-e2e.txt`, `evidence/M1-browser-evidence.png`, `evidence/dashboard.png`. Refresh nepřerušil worker.

M3 implementováno: skutečné CLI argv pro Codex a Claude, help/version/login doctor, whitelist environment, žádný API-key fallback, incremental JSONL, odmítnutí chybějícího finále/invalid JSON/signal, requested/actual model, immutable read-only export, explicitní DEMO subprocess. `pnpm test -- tests/integration/m3.test.ts` spustilo všechny tři tehdejší soubory: PASS 9/9, `evidence/M3-tests.txt`. Zápisový pokus DEMO reviewera byl odmítnut. Nezávislé read-only review identifikovalo další procesní a Git edge cases; opravy a regresní testy jsou součástí následujícího hardeningu. AT12 live inference NOT_RUN — nebyla explicitně vyžádána; nepředstírá se readiness skutečného modelu.

## M4 — výsledek

Implementováno: tři režimy, schéma+sémantika review, nezávislé session, frozen scope, fingerprint testů, required coverage, mapping finding → fix, nejvýše 3 review / 2 opravy, oddělené gate policy a test statusy, skutečný contract runner s dosavadními klienty.

`pnpm exec vitest run tests/integration/m4.test.ts` PASS 4/4, `evidence/M4-tests.txt`: dvě vadná repa → 2 findings → oprava → nový snapshot → skutečný contract PASS; persistent fixture skončila přesně po třech reviews v needs_input. Review-only nepoužil implementera; stale/foreign finding a coverage gap byly odmítnuty. Výsledky prvního selhání zůstávají uložené.

## M5 — výsledek

Implementováno: transakční semafory a fences, pevný worker owner, exclusive resource locks, runtime namespaces/porty/DB, readiness identity, teardown vlastních groups, konzervativní restart/sleep handling, retry jako nový run, queue reasons, pause/cancel. Při nejisté PID/group identitě se nové runy zastaví.

První M5 průchod 5/6: Chromium teardown přesáhl původní 500ms potvrzení. Po prodloužení omezeného čekání na potvrzený zánik group prošlo všech 6 M5 testů v kombinovaném M5/M6 běhu. Záměrně nejistý reused PID zůstal chráněný; souběžné databáze/porty, společný lock, cizí readiness marker, cancel potomků a simulace sleep jsou ověřené. Finální suite bude znovu zachycena v `evidence/final-tests.txt`.

## M6 — výsledek

Implementováno: report JSON + samostatný HTML s vloženými screenshoty, hash manifest, idempotentní filesystem publisher s `.pending` a atomic rename, historie runů, manual evidence, rozlišení web/mobile viewport, explicitní Maestro adapter s ověřením identity build/device/endpoint, parser JUnit, zachování failed/skipped/flaky/not_run. Uživatelské nastavení destination, modelů a limitů.

`pnpm exec vitest run tests/integration/m6.test.ts` PASS 3/3, `evidence/M6-tests.txt`. Reálný export/retry/integrita a parser negativních výsledků ověřeny. Maestro live NOT_RUN: CLI, device, build a flow nejsou dostupné. Žádný native PASS nebyl vyroben.

## M7 a závěrečný hardening — výsledek

Implementováno: explicitní read-only Linear import s blockers/pins; globální/projektové/taskové modelové defaulty; onboarding schválených příkazů, služeb a env references; session/CSRF a bounded request bodies; canonical paths a identity zdrojů/destinations; kontrola secrets a ZIP obsahu; immutable report revisions; explicitní retention s ochranou worktrees; lidské schválení a rozhodnutí vázané na snapshot. QA regrese vytvoří strojový finding a UI připraví nový task nad snapshotem; uložení tasku nic nespouští.

Nezávislý read-only review pass vedl k opravám procesních identit, podvrženého exit markeru, nejistého cleanupu/leases, staged/historických secrets, Git pathspeců, identity source checkoutu, resource locků QA příkazů a zániku služby po readiness. Reporty mají atomicky zapsané neměnné soubory i manifest; retention lze dokončit po přerušení mezi smazáním souborů a auditem. Závěrečná nezávislá kontrola těchto posledních oprav a QA findings nenašla nový nález. Recenzent neprováděl úpravy ani netvrdil opakované spuštění testů; níže uvedené procesy spustil hlavní agent.

## Původní ověření — 12. 10. 2026

Vše v této historické tabulce spuštěno 12. 10. 2026 na uvedeném macOS/Node. `pnpm test` začal 23:37:23 Europe/Prague. Aktuální průchody po navazujících opravách a skills jsou v tabulce z 13. 10. výše.

| Přesný příkaz | Výsledek | Důkaz |
|---|---|---|
| `pnpm lint` | PASS | [final-lint.txt](evidence/final-lint.txt) |
| `pnpm typecheck` | PASS, strict TypeScript | [final-typecheck.txt](evidence/final-typecheck.txt) |
| `pnpm test` | PASS, 8 souborů / 39 testů, 27.75 s | [final-tests.txt](evidence/final-tests.txt) |
| `pnpm build` | PASS, produkční Next.js webpack build | [final-build.txt](evidence/final-build.txt) |
| `HUB_E2E_PRODUCTION=1 pnpm test:e2e` | PASS, 4/4, 23.3 s | [production-e2e.txt](evidence/production-e2e.txt) |
| `pnpm test:e2e` | PASS, 4/4, 25.3 s; před posledním rozšířením o QA fix task | [final-e2e.txt](evidence/final-e2e.txt) |
| `HUB_DATA_DIR="$PWD/.hub-data" pnpm run doctor` | Dokončeno; Codex unverified, Claude blocked; bez inference | [provider-doctor-final.jsonl](evidence/provider-doctor-final.jsonl) |
| `HUB_DATA_DIR="$PWD/.hub-data" pnpm demo` | Skutečné tři Git repozitáře a uložený demo task | [demo-setup.txt](evidence/demo-setup.txt) |
| `HUB_DATA_DIR="$PWD/.hub-data" pnpm start` | Web na loopbacku a samostatný worker | [production-start.txt](evidence/production-start.txt) |
| `node evidence/verify-demo.mjs` | PASS: API → skutečné QA → export → browser `file:`; 0 HTTP/CDN requestů | [demo-verification.txt](evidence/demo-verification.txt), [demo-run.json](evidence/demo-run.json) |

Testy jsou kombinovaná unit/integrační sada: M1 4, M2 1, M3 5, M4 4, M5 6, M6 3, M7 8 a hardening 8. Souhrnný počet není počet samostatných akceptačních požadavků; každý test obsahuje více assertions. Pro cílené opakování použijte `pnpm exec vitest run tests/integration/m5.test.ts`; pro celou sadu `pnpm test:integration`.

Produkční browser E2E ověřilo vytvoření tasku, reload pokračujícího běhu, skutečné screenshoty, ruční PNG, lidské schválení syntetického testu, neúspěšnou registraci a její QA finding, přípravu opravy bez Start, pause/retry/cancel, CSRF, izolované HTML downloady, SSE cursor a mobilní viewport dashboardu. [Dashboard](evidence/dashboard.png), [failure evidence](evidence/failure-evidence.png), [mobile dashboard](evidence/mobile-dashboard.png).

## Trvalé demo pro předání

Run `36f86a8e-0e0d-48b7-b98f-626779209efa`, snapshot `5f3c4538-bd8b-4251-80b2-1bc4231e8f84`: **registration PASS, contract PASS, native NOT_RUN**. Režim `qa_only`: žádná LLM inference, code review nebylo vyžádáno. Report zůstává `awaiting_human_qa`, bez udělení lidského schválení. Má šest hashovaných artefaktů: admin/live PNG, Playwright trace, video a HTML/JSON report.

Export: [samostatný HTML report](evidence/demo-export/delivery-hub/9cba5e52-7dc6-4645-bcbc-77337d50fa1f/64881d87-f15a-4ea9-a81c-e8202016800b/36f86a8e-0e0d-48b7-b98f-626779209efa/5f3c4538-bd8b-4251-80b2-1bc4231e8f84/bf8dce3aecb1f959/index.html), [manifest](evidence/demo-export/delivery-hub/9cba5e52-7dc6-4645-bcbc-77337d50fa1f/64881d87-f15a-4ea9-a81c-e8202016800b/36f86a8e-0e0d-48b7-b98f-626779209efa/5f3c4538-bd8b-4251-80b2-1bc4231e8f84/bf8dce3aecb1f959/manifest.json), [receipt published](evidence/demo-export/delivery-hub/9cba5e52-7dc6-4645-bcbc-77337d50fa1f/64881d87-f15a-4ea9-a81c-e8202016800b/36f86a8e-0e0d-48b7-b98f-626779209efa/5f3c4538-bd8b-4251-80b2-1bc4231e8f84/bf8dce3aecb1f959/publication.json), [screenshot exportu](evidence/export-report.png). HTML obsahuje stav sběru `local_only`; pozdější skutečné publikování dokládá neměnný receipt `publication.json`, stav runu v UI je `published`.

## AT01–AT40

**PASS níže znamená uvedený lokální deterministický test/fixture, ne ověření firemního produktu.** Aktuální integrační sada [46/46](evidence/live-final-tests.txt), UI [5/5](evidence/live-final-e2e.txt). Živý Codex má vlastní důkaz; další live části mají NOT_RUN i při úspěšném fixture parseru.

| ID | Stav | Skutečný rozsah a odkaz na test |
|---|---|---|
| AT01 | PASS | Manual/demo bez credentials, skutečné web assertions, PNG i selhání; [M1](tests/integration/m1.test.ts), [UI](tests/e2e/hub.spec.ts). |
| AT02 | PASS | Refresh/reconnect a SSE od cursoru pokračují nad stejným runem; [M1](tests/integration/m1.test.ts), [UI](tests/e2e/hub.spec.ts). |
| AT03 | PASS | Dva runy / šest worktrees ve třech skutečných repo, nezávislé změny stejného souboru; [M2](tests/integration/m2.test.ts). |
| AT04 | PASS | Staged/unstaged/untracked source zachován, import jen commitů, změněná source identita odmítnuta; [M2](tests/integration/m2.test.ts), [M7](tests/integration/m7.test.ts). |
| AT05 | PASS | Add/modify/delete, sanitized diffs, staged a historické secrets; [M2](tests/integration/m2.test.ts), [M7](tests/integration/m7.test.ts). |
| AT06 | PASS | Git cache contention a protected cleanup; [M2](tests/integration/m2.test.ts), [hardening](tests/integration/hardening.test.ts). |
| AT07 | PASS | Branch drift nemění SHA aktivního runu, freshness označí stale; [M2](tests/integration/m2.test.ts), [M7](tests/integration/m7.test.ts). |
| AT08 | PASS | Immutable argv a dědičnost rolí/defaultů, bez modifikace CLI config; [M3](tests/integration/m3.test.ts), [hardening](tests/integration/hardening.test.ts). |
| AT09 | PASS | Fixture CLI missing/unsupported flags/login, neověřený model blokován; skutečný doctor zaznamenán výše; [M3](tests/integration/m3.test.ts). |
| AT10 | PASS | Missing final/invalid JSONL/signal a forged stderr exit nemohou vytvořit úspěch; [M3](tests/integration/m3.test.ts). |
| AT11 | PASS | Skutečný DEMO child nemůže zapsat do read-only exportu; omezené argv. Skutečný Codex read-only smoke také PASS; [M3](tests/integration/m3.test.ts), [live smoke](evidence/codex-live/smoke.json). |
| AT12 | Codex PASS / Claude NOT_RUN | Výslovně vyžádaný skutečný Codex 0.162.1 smoke a review_qa PASS; [procesy](evidence/codex-live/final-process-evidence.json). Claude login chybí; žádná Claude inference nebyla spuštěna. |
| AT13 | PASS | Review-only s findingem nespustí implementera; [M4](tests/integration/m4.test.ts). |
| AT14 | PASS | Contract mismatch → nezávislé review → mapovaná oprava → nový snapshot → skutečný contract PASS; [M4](tests/integration/m4.test.ts). |
| AT15 | PASS | Přesně tři review, nejvýše dvě opravy, needs_input; [M4](tests/integration/m4.test.ts). |
| AT16 | PASS | Chybějící repo coverage nesplní review gate; [M4](tests/integration/m4.test.ts). |
| AT17 | PASS | Otisk zamčeného testu odmítne změkčení testu; prázdné/skip výsledky nesplní gate; [M7](tests/integration/m7.test.ts), [M6](tests/integration/m6.test.ts). |
| AT18 | PASS | Cizí repo/cesta, stale snapshot a neplatné coverage odmítnuty; [M4](tests/integration/m4.test.ts). |
| AT19 | PASS | Durable duplicate Start a odmítnutí druhého workeru; [M1](tests/integration/m1.test.ts). |
| AT20 | PASS | Dva skutečné web runy s odlišnými porty, SQLite/data a browser contexts; [M5](tests/integration/m5.test.ts), [hardening](tests/integration/hardening.test.ts). |
| AT21 | PASS | Atomické resources, shared/exclusive locks, lease nepovolí nejistý cleanup; [M5](tests/integration/m5.test.ts), [hardening](tests/integration/hardening.test.ts). |
| AT22 | PASS | Cizí readiness marker a pád služby po readiness nezpůsobí PASS; [M5](tests/integration/m5.test.ts), [hardening](tests/integration/hardening.test.ts). |
| AT23 | PASS | Cancel vlastní group/potomků zachová vedlejší proces; pause/retry/cancel UI; [M5](tests/integration/m5.test.ts), [UI](tests/e2e/hub.spec.ts). |
| AT24 | PASS | Skutečný kill fixture workeru a recovery agenta, simulovaný reused PID chráněn; [hardening](tests/integration/hardening.test.ts), [M5](tests/integration/m5.test.ts). |
| AT25 | PASS | Simulovaný skok hodin, expired lease a disk quota zastaví nové běhy. Disk MacBooku se fyzicky nezaplňoval; [M5](tests/integration/m5.test.ts), [hardening](tests/integration/hardening.test.ts). |
| AT26 | PASS | Live → backend → admin se stejným ID/jménem, skutečné PNG/trace/video; [M1](tests/integration/m1.test.ts), [demo proof](evidence/demo-run.json). |
| AT27 | PASS | Empty/skipped/flaky/blocked/not_run a runner failure se nezmění na PASS; historie výsledků zůstává; [M6](tests/integration/m6.test.ts), [M4](tests/integration/m4.test.ts). |
| AT28 | NOT_RUN | Maestro/device/build/flow nedostupné. Parser fixtures pro failed/skipped/malformed/empty mají PASS; [M6](tests/integration/m6.test.ts), demo vrací native not_run. |
| AT29 | PASS | Manual PNG má autora/původ a nevytváří test PASS; mobilní browser není native; [M7](tests/integration/m7.test.ts), [UI](tests/e2e/hub.spec.ts). |
| AT30 | PASS | Nový run bez starého approval, stale baseline, nezměnitelný scope; [M7](tests/integration/m7.test.ts), [hardening](tests/integration/hardening.test.ts). |
| AT31 | PASS | Skutečný filesystem export, idempotentní retry po připraveném částečném `.pending` copy/manifestu a kontrola hashů; [M6](tests/integration/m6.test.ts). |
| AT32 | PASS | Více runů/revizí nepřepisuje historii; skutečný browser otevřel export přes `file:` bez serveru/CDN; [M6](tests/integration/m6.test.ts), [demo verifier](evidence/verify-demo.mjs). |
| AT33 | PASS | Host/Origin/session/CSRF, negativní API requesty z browser testu; [M7](tests/integration/m7.test.ts), [UI](tests/e2e/hub.spec.ts). |
| AT34 | PASS | Traversal a symlink escape odmítnuty; HTML download má attachment/CSP sandbox/nosniff; [M7](tests/integration/m7.test.ts), [UI](tests/e2e/hub.spec.ts). |
| AT35 | PASS | Issue shell text zůstává daty, žádná interpolace, secrets nejsou povolený export; [M7](tests/integration/m7.test.ts). |
| AT36 | PASS | Env whitelist, redakce, canary/sensitive ZIP a storage-state blokování; [M7](tests/integration/m7.test.ts), [M6](tests/integration/m6.test.ts). |
| AT37 | NOT_RUN | Živý Linear token a vybrané issue chybí. Explicitní fixture import/blocker/pin/no-auto-Start mají PASS; [M7](tests/integration/m7.test.ts). |
| AT38 | PASS | Nový backend proti baseline client/service, skutečný kontraktní defect odhalen; [M4](tests/integration/m4.test.ts). |
| AT39 | PASS | Approval pouze pro snapshot; false-positive/accept-risk audit nepromění FAIL na PASS; [M7](tests/integration/m7.test.ts), [hardening](tests/integration/hardening.test.ts). |
| AT40 | NOT_RUN | Tři Happenee repo byly explicitně vybrány a read-only onboardovány. QA příkazy, izolované prostředí, revize pilotu a dokumentační kontext zbývají. Firemní runy 0, změny checkoutů 0; lidské QA minuty se neměřily. [Onboarding](docs/HAPPENEE.md). |

## Integrace a zbývající ruční kroky

| Integrace | Implemented | Fixture-tested | Live-tested | Dostupnost / další krok |
|---|---|---|---|---|
| Git, SQLite, local worker | ano | ano | ano, skutečné lokální procesy/repa | připraveno |
| Playwright web QA | ano | ano | ano, skutečný syntetický HTTP server/browser | firemní příkazy vyžadují onboarding |
| Filesystem publisher | ano | ano | ano, skutečný lokální export | nový cíl registrovat v Settings |
| Codex CLI | ano | ano | ano: skutečný smoke, zamítnutí zápisu, review_qa a QA nad demem | 0.162.1 ověřeno; requested gpt-6.1-sol/low, actual unknown |
| Claude Code | ano | ano | pouze doctor/version/help/login; inference ne | oficiální CLI login, model, Test connection |
| Maestro/native | ano | parser a negativní preflight | ne | dodat CLI, device, build, flow a identity verification |
| Linear | ano, read-only | ano | ne | worker `HUB_LINEAR_TOKEN`, explicitní issue import |
| Interní HTTP/storage hub | není vyžadován pro v1 | ne | ne | skutečné rozhraní nebylo dodáno; použít filesystem export |
| Happenee skills | read-only adaptace obou existujících skills | ano: selection, freeze, hash drift, missing context a browser UI | firemní review ne | dodat explicitní dokumentační kontext a vybranou změnu |
| Firemní pilot | Happenee profil uložený, MOB/SERV/PLAT | syntetický průchod ano | ne | schválit scope exportu, revize a izolované QA prostředí/příkazy |

Spuštění a onboarding: [README](README.md), [ONBOARDING](docs/ONBOARDING.md). V pnpm 11 vyvolá `pnpm doctor` diagnostiku pnpm; hub se diagnostikuje příkazem **`pnpm run doctor`**. To je vědomé přizpůsobení skutečně instalovanému package manageru.

Pro první pilot použijte `review_qa`, vlastní důvěryhodná repa a syntetická QA data. V1 není izolovaný víceuživatelský sandbox. Live CLI model/capability nelze označit za ověřené jen ruční editací katalogu; po změně CLI verze je nutný nový explicitní smoke. Neověřené CLI bezpečně blokuje skutečnou roli. Žádné produkční testy, placené API nákupy, push, PR, merge, deploy ani Linear zápisy nebyly provedeny.

Výsledky a publikování jsou oddělené: publikovaný report není lidské schválení. Výjimka z findingu nevytváří test PASS. Pokud run skončí ještě před prvním checkpointem, diagnostika zůstane v timeline/logu; nelze exportovat důkazy neexistujícího testovaného snapshotu. Worktrees a přerušená práce zůstávají chráněné.
