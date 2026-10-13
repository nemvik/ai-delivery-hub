# Akceptační testy AI Delivery Hub

Testy se vztahují k budoucí implementaci. Tento balíček netvrdí, že je aplikace již
splňuje. Připravit deterministické automatizované testy; reálné účty a zařízení
ověřovat odděleně. Report musí uvádět přesný příkaz, datum, commit, výsledek a důkazy.

## Základní fixture

Generátor vytvoří tři skutečné lokální Git repozitáře: `fixture-monorepo` s malým
backendem a admin/live webem; `fixture-client` a `fixture-service` s minimálními
kontraktními testy. Poslední dva jsou testovací knihovny, **ne skutečné native appky**.
Slouží k ověření multi-repo práce. Neprodukovat z nich „native iOS“ screenshoty.

Fake CLI implementer/reviewer jsou samostatné skutečné child procesy se scénáři:
PASS, změna souboru, opravitelný contract defect, neplatný JSON, nedokončený JSONL,
pád, signal, hang, limit, pokus o zápis reviewera. Jejich artefakty mají DEMO label.

## Funkčnost a Git

| ID | Postup | Očekávaný důkaz/výsledek |
|---|---|---|
| AT01 | Spustit bez Linear/LLM credentials, založit manual task a demo QA. | Reálný web test a screenshot, DEMO provider jasně označený, žádné předstírané připojení. |
| AT02 | Během dlouhého kroku zavřít tab, otevřít jiný, reconnect SSE. | Tentýž run pokračuje, události lze dočíst, žádný dvojí proces. |
| AT03 | Dva tasky zasahují stejná tři repa a stejný soubor. | Odlišné worktrees/branches, nezávislé změny a unikátní run ID. |
| AT04 | Zdrojový checkout obsahuje unstaged, staged i untracked práci. | Import použije jen vybranou commitnutou revizi, upozorní na nezahrnuté změny, zdroj se nezmění. |
| AT05 | Implementer přidá nový soubor, upraví starý a něco smaže. | Snapshot a review zahrnou všechny tři operace; žádné secrets/build cache. |
| AT06 | Současné vytváření/rušení worktrees ve stejné Git cache. | Krátké repo locky zabrání kolizi; cleanup nezasáhne cizí/aktivní worktree. |
| AT07 | Po startu posunout source branch na jiný commit. | Aktivní run zůstane na připnutém SHA; refresh baseline označí starý výsledek jako stale. |

## Provideři a loop

| ID | Postup | Očekávaný důkaz/výsledek |
|---|---|---|
| AT08 | Nastavit role a modely různě u dvou tasků. | Každý subprocess dostane svou immutable konfiguraci; žádná změna uživatelského CLI configu. |
| AT09 | Chybějící CLI, neznámý model, nepodporované flags a chybějící login. | Doctor/předběžná kontrola konkrétně zablokuje krok; žádný tichý fallback/bypass/API nákup. |
| AT10 | CLI vrátí exit 0 bez finálního výsledku; pak invalid JSONL a exit signal. | Provider error nebo incomplete, nikdy PASS; logy a příčina dohledatelné. |
| AT11 | Reviewer se pokusí editovat soubor nebo spustit Bash/MCP write. | Nástroj odmítnut, export beze změny; nedostatečné omezení nepovolí produkční běh. |
| AT12 | Explicitní live smoke s každým skutečným CLI. | Uložená verze, dostupná capability, skutečný výstup. Bez credentials označit NOT_RUN. |
| AT13 | Režim review_qa vrátí blokující finding. | Report vznikne, kód se neopraví bez nového explicitního souhlasu. |
| AT14 | Režim implement_review_qa; fixture s contract mismatch. | Nezávislé review → oprava → nový snapshot → reálný contract test → nové review. |
| AT15 | Stejný finding přežije všechna tři review. | Přesně tři review, nejvýše dvě opravy; Needs input, bez nekonečné smyčky. |
| AT16 | Reviewer vrátí pass, ale nepokryje jedno required repo. | Incomplete/coverage gap; gate se nesplní. |
| AT17 | Implementer odstraní required test, vloží skip nebo změkčí assertion. | Změna je v diffu a review; zamčený required scope se neobejde. |
| AT18 | Nález odkazuje na cizí repo/cestu nebo nesouhlasící snapshot. | Výstup odmítnut či zablokován; nikdy vykonání vloženého příkazu. |

## Souběh, runtime a recovery

| ID | Postup | Očekávaný důkaz/výsledek |
|---|---|---|
| AT19 | Dvojklik Start, opakovaný API request, dva schedulery. | Jeden command/run díky idempotency a ownership; druhý worker neprovede cizí krok. |
| AT20 | Dva izolované QA runy a QA concurrency 2. | Různé porty, DB/seed/účty/cache/storage; zápis jednoho runu není vidět ve druhém. |
| AT21 | Dva tasky chtějí stejnou staging DB nebo stejné zařízení. | Druhý čeká na exclusive resource, v UI vysvětlení. |
| AT22 | Port mezi rezervací a bindem obsadí jiný proces, nebo readiness timeout. | Bezpečný retry startu / infra failure; žádný test proti cizí službě. |
| AT23 | Cancel procesu s potomky během implementace a během QA. | Skončí jen vlastní process group, cleanup potvrdí ukončení, vedlejší run pokračuje. |
| AT24 | Zabití workeru, restart při stále živém agentovi, simulace starého PID. | Reconciliation, žádný druhý writer, nezabít nesouvisející proces s reused PID. |
| AT25 | Simulovat sleep/velký skok hodin, expirované leases, disk full. | Pauza či interrupted; žádné duplikáty, ztráta rozpracovaného kódu ani false success. |

## QA, evidence a publikování

| ID | Postup | Očekávaný důkaz/výsledek |
|---|---|---|
| AT26 | Live registrace → backend → admin zobrazení. | Skutečné assertions, stejný datový identifikátor, cross-surface screenshots a snapshot metadata. |
| AT27 | Test vrací 0 tests, skipped, flaky, blocked nebo runner výpadek. | Přesný odlišný stav; required gate nesplněn, opakovaný pokus nemaže první selhání. |
| AT28 | Spustit existující Maestro flow; samostatně otestovat missing device. | Native metadata/build/endpoint a skutečné artefakty; bez zařízení NOT_RUN/BLOCKED. |
| AT29 | Přiložit ruční screenshot a web screenshot v mobilním viewportu. | `manual` a `web/mobile viewport`; žádné automatické native PASS. |
| AT30 | Po QA upravit zdroj, testovací plán nebo integration pins. | Nový snapshot, stará evidence historická, human approval se nepřenese. |
| AT31 | Dvakrát publikovat stejný report, během kopírování přerušit proces. | Jeden kompletní finální manifest, idempotentní retry, žádné nové spuštění testů. |
| AT32 | Exportovat více runů jednoho issue a otevřít report bez aplikace. | Historie zachovaná, správné relativní soubory, čitelný self-contained HTML report. |

## Bezpečnost, integrace a pilot

| ID | Postup | Očekávaný důkaz/výsledek |
|---|---|---|
| AT33 | Web cizího originu zavolá Start/Cancel; pokus bez session/CSRF. | Odmítnutí mutace; žádné wildcard CORS; platný local UI požadavek funguje. |
| AT34 | Traversal, symlink ven z artifact root, HTML s aktivním skriptem. | Žádný únik souborů, kód cizího reportu neběží pod hub originem. |
| AT35 | Do issue/logu vložit shell injection a pokyn k uploadu `.env`. | Data zůstávají daty; příkaz/publikace se neprovede. |
| AT36 | Canary secrets v parent env, trace, logu a storage state. | Agent je nezdědí zbytečně; exporter je nevystaví; neredigovatelný artefakt zablokován. |
| AT37 | Linear import se souvisejícím nevyřešeným blockerem. | Read-only import bez Start; explicitní dependency pin nebo Blocked. |
| AT38 | Starý klient proti novému backendu při změně kontraktu. | Nekompatibilita zachycena i tehdy, když všechny nové komponenty dohromady projdou. |
| AT39 | Human approval a pozdější rebase; výjimka na false-positive. | Schválení pouze pro snapshot; výjimka má autora/důvod a nezmění FAIL na test PASS. |
| AT40 | Dva reálné tasky z jednoho zvoleného produktu, jeden s regresí. | Reporty oddělené, dohledatelné důkazy, žádné prod side effects; uživatel změří lidské QA minuty. |

## Finální report implementace

Uvést AT01–AT40 jako PASS / FAIL / NOT_RUN, reference na testovací kód a výstup.
AT12, AT28 live, AT37 live a AT40 mohou vyžadovat uživatelův lokální setup.
Fixture test jejich parseru není náhrada živé integrace. Celá aplikace může být
předána s přesně uvedenými nedostupnými integracemi, ale ne s tvrzením o plně
ověřeném skutečném workflow, které neproběhlo.
