# Implementační plán — sedm funkčních milníků

Každý milník dokonči včetně testů a skutečně použitelného UI. Postupuj v rámci jednoho
repozitáře, bez paralelních zapisujících agentů do stejného checkoutu. Neodhaduj
hodiny implementace jako záruku. Stav a důkazy piš do `IMPLEMENTATION_STATUS.md`.

## M1 — lokální aplikace a první skutečný test

Založ pnpm workspace, Next.js a oddělený worker, SQLite schéma, command queue a SSE.
Implementuj vytvoření manual tasku, run, timeline, logy a cancel jednoduchého procesu.
Připrav lokální demo web se dvěma surfaces admin/live a skutečný Playwright scénář.
Ulož skutečný screenshot a výsledek; ukaž je v detailu runu. Zatím bez LLM.

**Hotovo:** `pnpm demo` vytvoří demo data a umožní z UI spustit skutečný test. Refresh
browseru běh nepřeruší. Test selhání zůstane červený. Artefakt má run a snapshot ID.

## M2 — multi-repo worktrees a identita sestavy

Registr projektů/repozitářů; spravované Git cache; tři fixture repo, nikoli tři části
jednoho Git repa. Refs přeložit na SHA. Unikátní branche/worktrees pro dva současné
tasky. Checkpointy, manifesty, nové soubory, zámky Git operací a bezpečný cleanup.
V UI výběr revizí, diff per repo a souhrnný snapshot. Podpora již existujících branches.

**Hotovo:** dva tasky mění stejný soubor ve stejném logickém repo bez vzájemného
přepsání; zdrojový checkout zůstává nezměněný. Necommitnuté zdrojové změny se neztratí.
Testy AT03–AT07.

## M3 — skutečné provider adaptery a nezávislé review

Adapter interface, verze/capability doctor, konfigurovatelné role a modely. Codex CLI
real integration, potom Claude Code. Nejdříve malý explicitní smoke test ve fixture.
Stream normalizace, exit/signal/timeouts, schema parsing, requested/actual model.
Reviewer nad read-only exportem bez exekučních nástrojů. Fake provider jen pro testy.

**Hotovo:** jedna role může používat každý provider. Nepřítomné CLI/přihlášení se
pravdivě zobrazí. Live smoke jen na výslovný pokyn. Nejsou změněna globální nastavení.
Read-only zápisový pokus je odmítnut. Testy AT08–AT12.

## M4 — řízený review/fix loop a gates

Tři režimy, immutable scope a QA plan, strukturované nálezy, priorita P0–P3, mapping
finding → oprava, nejvýše tři review. Spor nebo limit → Needs input. Repo checks
spouští controller; gate nesmí záviset na větě modelu „tests passed“. Fresh review
session, validace coverage všech relevantních repozitářů a shody snapshotu.

**Hotovo:** fake implementer vytvoří záměrný contract defect ve dvou repo, fake
reviewer ho konkrétně nahlásí, oprava se promítne do nového snapshotu a reálný contract
test teprve poté projde. Jiný fixture zůstane po limitu Needs input. Review-only režim
nic neopravuje. Testy AT13–AT18.

## M5 — resource scheduler, izolované QA a obnova

Globální semafory, transakční leases/fencing, port manifesty, unikátní DB/seed/cache
namespace, readiness, teardown, vlastní process groups. Reconciliation po restartu,
spánku a při osiřelém procesu. V UI queue reason a bezpečná pause/cancel/retry.

**Hotovo:** v testu lze zvýšit QA concurrency na 2 a prokázat oddělení dat/portů. Nad
sdíleným prostředím se běhy správně serializují. Kill/restart workeru nevytvoří druhého
writera. Výpadek readiness nevyrobí PASS. Testy AT19–AT25.

## M6 — důkazy, native adapter, export a pohodlné UI

Cross-surface Playwright scénář admin/live se skutečnými assertions. Galerie,
metadata, trace download, fail evidence, manual evidence, comparison jen se skutečnou
baseline. Adaptér pro existující Maestro flow a připravený device/build; test parseru
na explicitních fixtures, live test jen s dostupným prostředím. JSON a self-contained
HTML report, filesystem publisher a idempotentní retry. Dokonči dashboard a formuláře.

**Hotovo:** report věrně odliší web, native, manual, not run a flaky. Export lze
otevřít bez dashboardu; nový run nepřepíše starý. Chybějící hub API se nevymýšlí.
Mobilní live integrace bez zařízení zůstane neověřená. Testy AT26–AT32.

## M7 — Linear read-only import a finální hardening

Volitelný Linear adapter pro explicitní import vybraného issue včetně relevantních
vazeb a snapshotu kritérií. Nikdy automatický Start ani změna stavu issue. Doplnit
session/CSRF, path validation, secret redaction, omezení logů a disku, stale approvals,
retention preview a konfiguraci přes UI. Ověř celý build a integrační testy.

**Hotovo:** bez tokenu funguje manual režim a demo. S explicitně nakonfigurovaným
připojením import nespustí implementaci. Udělené schválení nepřežije změnu snapshotu.
Celý seznam AT01–AT40 má skutečný výsledek nebo konkrétní NOT_RUN důvod.

## Předání a pilot

Dodej `pnpm dev`, `pnpm start` po buildu, `pnpm doctor`, `pnpm demo`, test příkazy,
stručný návod onboardingu a podporované verze ověřených CLI. Výpis integrací musí
rozlišovat: implemented; fixture-tested; live-tested; unavailable.

První reálný produkt onboarduj až po explicitním výběru cest a příkazů uživatelem.
Spusť review_qa nad hotovou změnou a vyhodnoť report s člověkem. Následně dva souběžné
běhy; teprve po tom zapnout automatické publikování na schválený destination.
