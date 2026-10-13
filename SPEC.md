# AI Delivery Hub — implementační specifikace v1

**Datum:** 12. 10. 2026  
**Pracovní název:** AI Delivery Hub  
**Cílové prostředí:** lokální MacBook; později samostatný Linux/WSL worker  
**Charakter dokumentu:** zadání k implementaci, nikoli tvrzení o již existující aplikaci

## 1. Problém a cíl

Implementace úkolů je rychlá. Úzké hrdlo je společné ověření změn v několika repozitářích, lidské QA a příprava nasazení. Existuje monorepo, samostatná mobilní aplikace a servisní aplikace. Jedno Linear issue může zasahovat do všech. Uživatel již má interní hub, do kterého chce publikovat výsledky a vizuální důkazy.

Vytvořit lokální aplikaci, ve které uživatel vybere změnu, její repozitáře a přesné revize, nastaví implementačního a review agenta a spustí řízený běh. Běhy používají vlastní Git worktrees. Orchestrátor spouští implementaci, nezávislé review, omezený opravný cyklus a ověřitelné testy nad celou sestavou. Výstupem je dohledatelný report se screenshoty, testy, logy a zbývajícím ručním ověřením.

**Úspěch není „oba modely řekly hotovo“. Úspěch je konkrétní otestovaný snapshot, doložené scénáře a jasně přiznané mezery.**

Lokální je řízení, úložiště a běh vývojových nástrojů. Codex a Claude Code standardně komunikují s poskytovatelem modelu; tento projekt neslibuje offline inference ani to, že zdrojový kód nikdy neopustí počítač. Použít jejich podporované CLI přihlášení, nikoli vlastní napojení na placené LLM API jako povinný předpoklad. Dostupnost a spotřeba se řídí účtem poskytovatele. [S2, S6]

## 2. Závazné produktové hranice

- Linear je evidence práce, ne automatické povolení implementace. V1 začíná ručním importem nebo ručním zadáním a tlačítkem Start. Žádné zpracování celého backlogu.
- Nevyžadovat GitHub issues. Jeden change-set může obsahovat jedno hlavní a více souvisejících Linear issues.
- Nedělat automatický merge, push, nasazení, EAS Update ani publikování do obchodů. Lokální checkpoint commity ve spravovaných repozitářích jsou povolené.
- Nespouštět produkční DB migrace, skutečné platby, skutečné rozesílání zpráv ani testy proti produkci. Změny autentizace, oprávnění, plateb, infrastruktury a destruktivních migrací vyžadují zvláštní lidské schválení před implementací.
- Nepotřebovat Superset, n8n, Kubernetes, Redis ani vlastní distribuovaný agentní framework.
- Nepřepisovat uživatelovy existující pracovní checkouty ani globální nastavení Codexu/Claude Code.
- Nejprve fungující vertikální průchod; až potom více automatizace. Nevyvíjet znovu Linear, IDE ani existující firemní hub.

## 3. Rozsah první verze

### Povinné pro v1

Lokální dashboard; registr projektů a repozitářů; ruční task i volitelný Linear import; multi-repo worktrees; tři režimy běhu; konfigurovatelní Codex/Claude provideři; review/opravný cyklus; omezené paralelní plánování; reálné spouštění schválených testovacích příkazů; Playwright webové QA; galerie důkazů; JSON a statický HTML report; filesystem publikování; audit, cancel, obnova po restartu a ochrana před zastaralým výsledkem.

Mobilní aplikace je plnohodnotná součást change-setu, kontraktů a review již ve v1. V1 také umí spustit **existující nakonfigurované Maestro flow nad připraveným simulátorem/emulátorem a kompatibilním buildem**, importovat jeho výsledky a připojit ruční důkazy. Neobsahuje automatické zařizování podpisů, generování univerzálních mobilních flow ani správu build farmy. Chybějící native prostředí je `blocked`/`not_run`, nikoli úspěch. Maestro poskytuje strojové reporty a artefakty. [S11]

### Pozdější rozšíření, která nesmějí blokovat v1

Automatické native buildy a provisioning více simulátorů; vzdálené ephemeral prostředí; konkrétní HTTP/Azure/S3 adapter podle skutečného rozhraní interního hubu; explicitně vyvolané Draft PR a komentáře do Linearu; plánovač podle labelu; správa několika vzdálených workerů. Celá v1 musí být použitelná bez těchto rozšíření.

## 4. Základní pojmy

| Pojem | Význam |
|---|---|
| Project | Konfigurace produktu: repozitáře, komponenty, povolené příkazy, QA profily a publikování. |
| Repository | Jeden Git repozitář. Monorepo je stále jeden repozitář, nikoli jeden repozitář na frontend. |
| Surface | Testovaný povrch, např. backend, admin, live portál, native mobile nebo service app. Typ se konfiguruje, neodhaduje z názvu. |
| Change-set | Logická změna napříč repozitáři a souvisejícími issues. |
| Run | Jeden pokus o zpracování change-setu s neměnnou konfigurací a unikátním ID. |
| Snapshot | Přesná mapa repo → commit + otisky testovacího plánu a konfigurace prostředí. |
| Review round | Jedno nezávislé vyhodnocení konkrétního snapshotu. |
| Scenario | Ověření jednoho očekávaného chování s assertions a výsledkem. |
| Artifact | Screenshot, video, trace, log nebo report navázaný na run, snapshot a případně scénář. |
| Integration set | Výslovně vybraná společná sestava několika change-setů k integračnímu QA. |

Název branche nikdy není dostatečný identifikátor testované verze. Při startu se všechny refy přeloží na neměnná SHA. Stejně se připnou potřebné nezměněné komponenty.

## 5. Uživatelské scénáře

### A. Ověřit již hotovou práci — výchozí režim

Uživatel založí task z Linear ID nebo vloží text. Vybere například feature branch monorepa a mobile repa; servisní aplikaci ponechá na schváleném baseline. Zvolí `review_qa`. Hub připne SHA, vytvoří izolované pracovní kopie a ověří celou sestavu. Reviewer může navrhnout opravy, ale **bez explicitního zapnutí oprav se kód nemění**.

Tento režim má nejvyšší prioritu: řeší současný bottleneck, aniž uživatel musí měnit způsob zadávání implementace.

### B. Implementovat a vzájemně kontrolovat

Režim `implement_review_qa`: uživatel schválí scope, kritéria, repozitáře a modely. Implementer upravuje pouze worktrees daného runu. Controller vytvoří snapshot, spustí kontrolní příkazy, předá nezávislému reviewerovi celkovou změnu a podle strukturovaných nálezů případně spustí opravu. Nakonec proběhne integrační QA a vznikne evidence pack.

### C. Pouze opakovat testy

Režim `qa_only`: žádný zapisující agent a žádný opravný loop. Nový run nad zvoleným snapshotem; testy a publikování. Je možné testovat více tasků současně, ale jen s dostatečně izolovanými prostředky.

### D. Ověřit několik souvisejících změn společně

V1 umožní vytvořit integration set z **již uživatelem připravených integračních refů/SHA** a přiřadit mu více issues. Orchestrátor sám v první verzi neslučuje feature branche ani neřeší merge konflikty. Výsledek kombinace je další report, nikoli přepsání reportů jednotlivých změn.

## 6. Architektura a technologie

Doporučené řešení: TypeScript, pnpm workspace, Next.js UI/API a samostatný dlouho běžící Node worker. SQLite přes Drizzle + better-sqlite3 pro transakční stav. Zod pro vstupní validaci, JSON Schema pro výměnu s agenty, Vitest a Playwright pro testy samotného hubu. UI přes Tailwind a přiměřený počet shadcn/ui komponent. Verze vybrat kompatibilní při implementaci, připnout lockfile a ověřit na aktuálně podporovaném Node LTS; nekopírovat zastaralé major verze naslepo.

```text
apps/web/                 Next.js dashboard a krátké API requesty
apps/worker/              scheduler, procesy, Git, agenti, QA, export
packages/core/            stavový automat, gate policy, snapshoty
packages/db/              SQLite schéma a migrace
packages/adapters/        Codex, Claude, Git, Linear, Playwright, Maestro, publisher
packages/contracts/       sdílené typy a validátory
packages/test-fixtures/    malé lokální demo repozitáře a fake CLI procesy
```

Web ukládá příkazy do DB. Worker je transakčně přebírá. **Nespouštět dlouhé agenty uvnitř Next.js requestu, Server Action ani React lifecycle.** Zavření tabu nebo hot reload webu nesmí zastavit ani zdvojit běh.

Jeden worker/scheduler vlastní ve v1 všechny mutace běhů. SQLite použije WAL, busy timeout, krátké transakce a foreign keys. Soubor DB zůstane na lokálním disku; WAL není návrh pro sdílený síťový disk. [S14]

Progress jde přes SSE s pořadovým číslem události a obnovením po reconnectu. Nemusí jít o websocketovou aplikaci. Privátní logy držet v souborech, v DB metadata a omezené redigované události. Žádná práce s credentialy v browseru.

## 7. Uložení dat a izolace Git práce

Výchozí data mimo repo aplikace, např. `~/.ai-delivery-hub/`, cesta konfigurovatelná:

```text
state.sqlite
repos/<repositoryId>.git/                 spravované Git cache
runs/<runId>/worktrees/<repositoryId>/    zapisující checkouty
runs/<runId>/review/<snapshotId>/         sanitizovaný review export
runs/<runId>/runtime/                    env soubory, PID metadata; nepublikovat
runs/<runId>/logs/                       lokální redigované logy
artifacts/<project>/<issue>/<runId>/<snapshotId>/
exports/<project>/<issue>/<runId>/<snapshotId>/
```

Git worktrees poskytují oddělené pracovní stromy, ale část Git metadat sdílejí. Neizolují automaticky databáze, porty, účty či běžící služby. [S8]

Pro v1 používat **vlastní spravovanou bare cache pro registrované repo**, inicializovanou z uživatelem schváleného lokálního zdroje bez hardlinkovaného object store. Nad ní zakládat worktrees. Tím agenti nesdílejí Git konfiguraci původního uživatelova checkoutu. Pracovní soubory původního checkoutu se nemění.

Pravidla:

1. Zdrojová cesta musí být explicitně registrovaná a canonicalizovaná; cesty mimo seznam nepovolovat. Importovat jen commitnuté revize. Necommitnuté lokální změny zobrazit jako nezahrnuté; automaticky je nestashovat, necommitovat ani nekopírovat.
2. Branch má unikátní název `agent/<changeSetId>/<runId>/<repoKey>`. Retry kroku znovu nevytváří existující worktree.
3. Jeden zapisující agent na jeden run. Ten může měnit více worktrees ve schváleném pořadí. V1 nevytváří agenta na každý soubor ani paralelní writery do jednoho runu.
4. Krátké zámky serializují operace nad konkrétní Git cache: fetch/import, worktree add/remove a zápis refů. Samotné běhy na odlišných worktrees mohou pokračovat paralelně.
5. Git hooks a repo-local agent konfigurace se nepřebírají jako automaticky důvěryhodné exekuční instrukce. Povolí se jen konfigurace schválená při onboardingu.
6. Controller vytváří lokální checkpoint commity ze schválených zdrojových souborů; nikdy nezahrnout `.env`, klíče, session soubory, artefakty a dependency/build cache. Evidovat i nové soubory; nespoléhat pouze na unstaged diff.
7. Review dostane export přesného snapshotu, ne živě měněný adresář. Jakákoli změna kódu po snapshotu zneplatní navazující review a QA pro nový kód.
8. Cleanup pracuje jen s manifestem vlastních cest a ověřenou identitou runu. Aktivní worktree ani nearchivovanou práci automaticky nemaže. Žádný obecný `rm -rf` nad cestou od agenta.

## 8. Konfigurace projektů a tasků

Projekt eviduje repo klíče, lokální cesty, schválené baseline refy, package manager a testovací příkazy. Povrchy odkazují na repo a podadresář. Například `admin` a `live` mohou sdílet monorepo; `service-app` může být native nebo web — vybere to člověk.

Každý test/start/seed/stop příkaz je schválený objekt `{executable, args, cwd, timeoutSeconds, envRefs}`. Používat spawn/execFile s polem argumentů, bez shellové interpolace issue textu. Šablony dosazují pouze známé klíče, např. `run.id`, `ports.backend`, `paths.worktree`, nikoli libovolné JS či shell výrazy. Node subprocess API umožňuje oddělené argumenty a řízení procesu. [S13]

Nastavení rolí se dědí `globální → projekt → task`. Při enqueue vznikne immutable `RunConfig`. U role evidovat provider, model ID, effort, timeout a limit tahů, kde ho provider podporuje. Povolené hodnoty effort jsou provider-specific. Nezaměňovat model, provider a speed režim.

Model lze v UI změnit pro další běh nebo další výslovně schválený krok. Probíhající proces se potichu nepřepíná. Vždy uložit požadovaný model a skutečně nahlášený model; při neznámém výsledku uvést `unknown`, ne odhad.

Závislosti mezi issues: uživatel potvrdí, zda jde o skutečný blocker. Stav „Done“ v Linearu sám nedokazuje nasazení závislosti. Pro běh musí být vybrána konkrétní kompatibilní revize, anebo zůstane `blocked_dependency`. Žádný automatický merge cizího tasku.

## 9. Pipeline a opravný cyklus

```text
Explicit Start
→ validate scope / dependency pins / permissions / available tools
→ acquire resources and provision worktrees
→ optional implementation
→ immutable snapshot + deterministic repository checks
→ independent cross-repo review
→ optional approved fix → new snapshot → checks → next review
→ provision isolated runtime → integration / web / configured native QA
→ collect and validate evidence → compute gates → publish/export
→ awaiting_human_qa
```

`review_qa` nikdy neopravuje samo. Uživatel může z nálezů vytvořit navazující `implement_review_qa` run s explicitním scope opravy. `qa_only` přeskočí implementaci a review, ale výsledná stránka musí ukázat, že code review nebylo součástí tohoto runu.

`maxReviewRounds = 3` znamená **nejvýše tři review a dvě automatické opravy mezi nimi**, nikoli tři opravy plus další review. První reviewer dostane zadání, acceptance criteria, souhrnný manifest, diffs všech repozitářů, relevantní okolní kód, kontrakty a surové test reporty. Nedostane implementerovu argumentaci, proč je vše správně. V dalším kole dostane navíc předchozí nálezy a opravný diff.

Reviewer hledá především funkční chyby, API nekompatibility, regrese, nedostatečné testy, porušení oprávnění a chybnou práci s daty. Stylistické preference samy o sobě nespouštějí opravný loop.

Strukturovaný výstup odpovídá `contracts/review.schema.json`. Controller ověří snapshot, repo/cestu/řádek, pokrytí všech required repozitářů a syntaxi. Nález bez důkazu je hypotéza, nikoli autoritativní příkaz. Výstup agenta nesmí obsahovat spustitelné callbacky nebo ovládat scheduler.

Závažnost `P0/P1` blokuje gate. `P2` je explicitně viditelná výhrada, `P3` poznámka. Implementer musí u opravy uvést řešené finding ID a ověření. Nemůže potichu zahodit nález. Spor agentů, opakování stejného nálezu bez změny nebo vyčerpání rozpočtu vede do `needs_input`.

Neplatný review JSON dovolí jednu opravu formátu bez změny kódu. Další chyba je provider error. Bez skutečného review nevznikne zelený review status. Chybějící kontext znamená `incomplete` a vyžádání doplnění.

Při QA regresi se v1 vytvoří nález a nabídne explicitní nový opravný běh; nepřidávat nekontrolovaný druhý loop mimo stanovené limity.

## 10. Provider adaptery a bezpečnost agentů

V1 implementuje skutečné adaptery pro `codex-cli` a `claude-code-cli`. Oba podporují roli implementer/reviewer; testovací `fake` provider je oddělený a v UI vždy označený DEMO. Ověřené integrační body a příklady jsou v `PROVIDERS.md`. [S2–S7]

Adapter kontrakt: `doctor()`, `getCapabilities()`, `run(request, onEvent, signal)`, `normalizeResult()`. Capability informace obsahují podporu streamu, strukturovaného výsledku, resume, model discovery a permission profilů.

Používat child proces bez PTY pro neinteraktivní běhy. Parsovat JSONL inkrementálně; log limit, neúplný poslední řádek, stderr, exit signal a chybějící finální event musí být ošetřené. Nezaměnit exit 0 samotného CLI za splnění tasku.

Reviewer nemá zapisující ani příkazové nástroje. Claude adapter použije podporované restricted/read-only nastavení, výslovný tool allowlist bez Bash/Write/Edit a zákaz nepovolených MCP nástrojů. Codex reviewer použije read-only sandbox. Izolované review exporty neobsahují secrets ani aktivní projektové pluginy/hooks. Před i po review se ověří otisk exportu. Pokud daná verze CLI neumí potřebné omezení, `doctor` funkci zablokuje; neobejde ho režimem bypass. Permission allowlist není totéž jako OS sandbox. [S3, S7]

Implementer má zápis pouze do schválených worktrees; instalace balíčků a network přístup se schvalují při onboardingu projektu. Testovací příkazy spouští controller podle schváleného plánu. Přístup k produkčním údajům, publisher tokenům a Linear tokenům agent nepotřebuje.

**V1 zpracovává pouze důvěryhodné vlastní repozitáře.** Lokální procesy a testovaný kód běžící pod stejným uživatelem nejsou bezpečný multi-tenant sandbox. Neznámé repozitáře vyžadují separátní kontejner/VM a nejsou podporovaný unattended scénář v1.

Provider nesmí sám přepnout na placené API, dražší model ani dodatečné kredity jako fallback. Vyčerpaný limit vede k pauze. Případný fallback samotného CLI zaznamenat ze skutečných metadat a označit odchylku od požadované konfigurace.

## 11. Scheduler, paralelismus a obnova

Výchozí limity pro první běh na MacBooku jsou návrh, nikoli příslib naměřeného výkonu:

```text
maxActiveRuns = 2
maxAgentProcesses = 2          # společný limit implementerů i reviewerů
maxHeavyBuilds = 1
maxQaEnvironments = 1          # lze explicitně zvýšit na 2 po ověření izolace a RAM
maxBrowserWorkersTotal = 2
maxNativeDevicesInUse = 1
maxReviewRounds = 3
maxRunMinutes = 120
```

Tasky mohou implementovat paralelně, i když náročné integrační QA čeká ve frontě. Každý běh ukáže, na jaký prostředek čeká. V1 nepovolovat samovolné vnořené agentní roje; provider-specific subagenti se musí vejít do schváleného execution/usage profilu.

Scheduler získává prostředky transakčně a ve stabilním pořadí, nebo vše uvolní a čeká. Zámky mají owner, heartbeat a fencing token. API Start má idempotency key; dvojklik či opakovaný request nespustí duplikát. Leases a stav kroku žijí v DB, ne pouze v paměti.

Každý proces má run ID, step ID, process group, PID, start-time/identity metadata a lokální log. Cancel zastaví potomky tohoto runu, počká na ukončení a teprve potom uvolní prostředky. Nepoužívat `killall node` ani zabití všech procesů na portu. Při nejisté identitě procesu pauza a lidské řešení.

Při pádu workeru nebo spánku MacBooku nesmí vypršení lease samo spustit druhého writera. Nový worker nejprve udělá reconciliation živých procesů a resource manifestů. Rozběhnutý krok označí `interrupted`; bez bezpečně potvrzeného ukončení starého procesu ho neopakuje. Automatické navázání na libovolnou „poslední“ CLI session je zakázané. Resume pracuje výhradně s uloženým session ID stejného runu a snapshotovým kontextem.

V1 smí obnovu řešit konzervativně: zobrazit Interrupted, potvrdit/ukončit vlastní osiřelé procesy a nabídnout opakování bezpečného kroku. Nevyžadovat dokonalé live připojení ke ztracenému stdout.

## 12. Izolace běhového a testovacího prostředí

Každý QA run má runtime manifest: služby, startovací příkazy, healthchecky, port leases, DB namespace, seed, účty, cache prefix, upload prefix a případně device ID.

- Port není vypočten pouze z issue čísla. Scheduler rezervuje rozsah a ověřuje skutečný bind; konflikt při startu znamená nový pokus před publikováním endpointů.
- Databáze je samostatná instance nebo samostatná DB/schema s vlastními omezenými credentials. Samotné odlišné jméno uživatele v jedné neizolované DB není dostačující pro destruktivní testy.
- Fronty, cache a soubory mají prefix run ID nebo vlastní instanci. Pozadí/cron nesmí zpracovávat cizí testovací data. Email, SMS, push a platby vedou pouze do testovacích sinků.
- Browser má oddělený context/storage state a unikátní testovací účty. Playwright paralelní workery lze využít, ale izolace serverových dat musí být navržena zvlášť. [S10]
- Jedna sdílená staging DB nebo jeden fyzický telefon znamenají exkluzivní resource lock. UI nikdy neslibuje paralelní mutační testy nad neizolovaným prostředím.
- Služby startují v dependency pořadí a QA až po healthchecku. Readiness má timeout. Logy sbírat od startu, teardown se volá i při chybě.

Nepředpokládat Docker u každého projektu. V1 má process adapter a rozhraní pro konfiguraci existujících lokálních služeb. Docker Compose adapter je možné doplnit tam, kde je už zaveden. Příkazy pro konkrétní PHP/Node/Expo projekt musí projít onboardingem; neexistuje univerzální automatické odvození funkčního prostředí z názvu repozitáře.

Není-li lokální stack připravený, lze provést pouze statické review/repo checks. Integrační část zůstane zablokovaná a report se tak označí.

## 13. Testování napříč repozitáři

Povinné vrstvy jsou konfigurovatelné per QA profil, nikoli modelův volný odhad:

1. **Repo checks:** lint, typecheck, unit/integration, build podle projektu. Výsledek z exit code a podporovaného reportu; pro suite navíc počet vykonaných testů. „No tests found“ se nepočítá jako prokázané pokrytí.
2. **Kontrakty:** API request/response, nullable a default hodnoty, autentizační očekávání, chování mobile/service klientů. Pokud existuje OpenAPI/schema/contract suite, použít ji; jinak navrhnout testy jako součást scope.
3. **Cross-surface scénáře:** např. registrace v live portálu → API záznam → účastník v adminu → stejná data v mobilním klientu. Jeden scenario ID může mít důkazy z více surfaces.
4. **Web QA:** Playwright nad skutečně spuštěnou sestavou. Assertions na chování a data, nikoli jen screenshot po načtení stránky. Ukládat důležité screenshoty, při chybě trace a případně video. Trace umí dokumentovat kroky a DOM snapshoty. [S9]
5. **Native/hardware QA:** nakonfigurovaný Maestro runner, nebo jasně označená ruční kontrola. Připojení skutečné tiskárny, Bluetooth, fyzický scanner, reálné push delivery a chování na konkrétním zařízení se neoznačí za ověřené jen díky browseru či simulátoru.

Acceptance criteria se po Start zamknou do hashovaného plánu. Agent může přidávat testy, ale nemůže si bez schválení odstranit required scénář, vypnout assertion či schválit nové vizuální baseline. Změny existujících testů jsou součástí review. Gate počítá controller, nikoli model.

Změněné soubory po spuštění kontrol musí být detekované. Testy nesmějí potichu změnit testovaný zdrojový snapshot; build outputs patří do předem schválených ignorovaných adresářů. Při změně zdrojů vzniká nový snapshot a nové ověření.

U rollout kompatibility kontrolovat také **nový backend + dosavadní klient** a podle pořadí nasazení **nový klient + dosavadní backend**. Úspěch všech nejnovějších branches nedokazuje bezpečnost postupného nasazení. Ve v1 jde o explicitní contract/scenario matrix a report doporučeného pořadí, ne o automatický deploy.

## 14. Mobilní a servisní aplikace

Surface deklaruje `web`, `api`, `native_ios`, `native_android` nebo `library`. Servisní aplikaci automaticky nepovažovat za web. U native testu evidovat bundle/application ID, OS, device/simulator ID, nativní build fingerprint, JS bundle/revizi, runtimeVersion a skutečný backend endpoint.

Připravený dev build lze znovu použít jen při kompatibilním nativním runtime. Změna native knihoven, pluginů nebo konfigurace může vyžadovat nový build. Expo update nenahrazuje nekompatibilní nativní část. [S12]

V1 spustí pouze explicitně zvolený již připravený testovací build/flow. Před testem ověří endpoint a identitu sestavy; pokud projekt build/revision marker neumí, onboarding musí dodat verifikační krok, jinak pokrytí označit jako neověřené. Metro instance a port jsou součást runtime manifestu. Sdílení identické app ID na jednom simulátoru znamená sekvenční testování.

Responsive screenshot webu má label `web / mobile viewport`, nikoli `iOS verified`. Ručně přiložený screenshot má `source=manual`, autora a datum; nesmí z něj vzniknout automatický PASS.

## 15. Důkazy, reporty a interní hub

Artefakty ukládat do neměnné struktury podle projektu, issue, runu a snapshotu. Více pokusů téhož issue se nepřepisuje. Každý záznam obsahuje SHA-256, velikost, MIME, relativní cestu, autora/runner, čas, surface, scenario a klasifikaci citlivosti.

Minimální report: přesné repo SHA a baselines; konfigurace agentů; průběh review a nevyřešené nálezy; stavy všech required scénářů; skutečně vykonané testy; screenshoty; zbývající ruční kroky; technické blokery; kompatibilita rollout pořadí; provenance a stav publikování.

Příklad výstupu: „Web registrace a admin prošly. Mobile contract test prošel. Native mobile nebylo spuštěno — chybí build. Tisk je nutné ověřit s fyzickou tiskárnou.“ Nikdy všeobecné „otestováno“, pokud něco chybí.

Generovat `report.json`, self-contained `index.html` a manifest artefaktů. HTML musí být čitelné bez veřejných CDN. V galerii seskupovat podle scénáře a surface; before/after jen s doloženou baseline. Agentní komentář zobrazit odděleně od strojového assertion výsledku.

**Existující interní hub má zatím neznámé rozhraní. Nevymýšlet jeho endpointy, autentizaci ani datový model.** V1 realizuje `FilesystemPublisher` do uživatelem vybrané složky a jednotné rozhraní `ArtifactPublisher`. To dovolí použít připojený disk/sync nebo následně přidat skutečný HTTP/storage adapter. Kód, testy a lokální export musí fungovat i bez připojeného hubu.

Publikování má vlastní idempotentní frontu: klíč `destinationId + runId + snapshotId + manifestHash`. Nejprve zapsat do dočasného cíle, ověřit soubory a teprve potom atomicky zveřejnit manifest. Retry exportu neopakuje agenty ani testy. Cílová složka musí být mimo zdroj artefaktů; blokovat traversal a symlink escape. U vzdáleného adapteru vyžadovat receipt a kontrolu integrity podle skutečného rozhraní.

Výchozí publikování je vypnuté. Uživatel schválí destination a projektovou politiku. Poté může být automatické po každém dokončeném běhu, včetně částečného/neúspěšného reportu. Report musí jednoznačně odlišit `local_only`, `published` a `publish_failed`. `published` není tvrzení, že QA prošlo.

## 16. Webové rozhraní

### Dashboard

Kompaktní desktopový přehled. Levý panel Projects / Tasks / Runs / Settings. Horní lišta zdraví workeru, počet běhů, resource limity a New task. V seznamu issue, popis, dotčená repa, fáze, modely, review kola, QA coverage, doba čekání a tlačítka View/Cancel. Rozlišit queued, blocked, running, needs input a waiting for human QA; nespoléhat pouze na barvu.

### Formulář tasku

Manual nebo Import Linear; výběr projektu; source refs pro každé repo; dependency pins; acceptance criteria; mode; implementer/reviewer provider+model+effort; QA profil; maximální kola a runtime; publikování. Defaulty z projektu, per-task override viditelný. Před Start shrnutí přesně toho, co se bude spouštět, zapisovat a odesílat.

### Detail tasku/runu

Záložky `Overview | Changes | Review | Tests | Evidence | Logs`.

- Overview: snapshot, timeline, gate summary, blokery, další konkrétní lidský krok.
- Changes: souhrn napříč repy a diff per repo; změny testů viditelné.
- Review: nálezy s důkazy, historií a rozhodnutím. Akce Accept & fix, Dispute, Explain; rizikové výjimky jen člověk s důvodem.
- Tests: scénáře `passed/failed/blocked/not_run/skipped/flaky`, expected versus observed, runner a coverage required surfaces.
- Evidence: galerie admin/live/mobile/service, vyhledávání dle scénáře, screenshot, video/trace, metadata a baseline. Jasně označit manual a DEMO.
- Logs: redigovaný stream, filtry podle kroku a procesu; žádné tajné prompty či autentizační data v exportu.

Globální nastavení: provider doctor a zjištěná verze, modely, omezení souběhu, cesty, publisher destinations, disk usage a ruční cleanup. Test spojení s poskytovatelem je výslovná akce, protože může spotřebovat usage.

UI má být skutečně funkční, nikoli statický mockup. Prázdný stav provede uživatele založením demo projektu. Keyboard ovládání, čitelný kontrast, responzivita, dark/light varianta. Nevyžadovat animace, grafový editor pipeline ani drag-and-drop workflow builder.

## 17. Datový model a API

Tabulky:

- `projects`, `repositories`, `surfaces`, `command_profiles`, `qa_profiles`, `provider_profiles`.
- `change_sets`, `change_set_issues`, `dependency_pins`, `runs`, `run_repositories`, `snapshots`.
- `steps`, `process_records`, `resource_leases`, `events`, `commands`.
- `review_rounds`, `findings`, `finding_decisions`, `scenarios`, `scenario_results`, `artifacts`.
- `human_approvals`, `publisher_destinations`, `publish_jobs`, `publish_receipts`.

Všechny entity mají stabilní ID a timestamps. Run uchovává immutable kopii účinné konfigurace; změna projektu zpětně nepřepíše historii. Artefakty mají unikátní vazbu na snapshot a hash. Žádné raw secrets v DB.

Run lifecycle: `queued → running → awaiting_human_qa → verified`; vedlejší stavy `blocked`, `needs_input`, `paused`, `interrupted`, `failed`, `cancelled`. `verified` nastavuje pouze člověk pro konkrétní snapshot. Field `stale` je samostatný příznak vzhledem k cílovému baseline, nikoli přepis historického výsledku. Publikování je oddělený stav.

Step state: `pending`, `running`, `succeeded`, `failed`, `skipped`, `cancelled`, `interrupted`. QA status `passed/failed/blocked/not_run/skipped/flaky` je jiný enum a nesmí se ztratit při agregaci.

API návrh pod `/api/v1`:

```text
GET/POST /projects
GET/POST /projects/:id/repositories
POST     /integrations/linear/import          read-only import, není Start
POST     /providers/:id/doctor
POST     /providers/:id/test-connection       výslovná placená/usage akce
GET/POST /change-sets
POST     /change-sets/:id/runs                idempotency key
GET      /runs/:id
POST     /runs/:id/actions                   cancel/pause/retry-step/publish/approve
GET      /runs/:id/events                    SSE, Last-Event-ID
GET      /runs/:id/artifacts
GET      /artifacts/:id/content              jen registrované ID, žádná raw cesta
POST     /runs/:id/manual-evidence
```

Mutace validovat, auditovat a vynucovat stavové přechody na serveru. Tlačítko disabled není autorizační kontrola. Dvojí approve/publish/start musí být idempotentní.

## 18. Bezpečnost lokálního hubu

Server bind pouze na loopback. Localhost není sám o sobě dostatečná autentizace: náhodný lokální session secret, same-site cookie, Origin/Host kontrola, CSRF ochrana mutací a zákaz wildcard CORS. Nikdy neinicializovat mutace přes GET. SSE a artefakty vyžadují session. Přístup z LAN/Tailscale až jako explicitní samostatná konfigurace s autentizací.

Řetězce z issues, repo souborů, review či testovacích logů považovat za nedůvěryhodná data. Neprovádět jejich shell příkazy, nepromovat je do systémových instrukcí controlleru. Markdown/HTML sanitizovat. Cizí HTML reporty servírovat jako download nebo izolovaný sandbox bez přístupu k autentizovanému originu.

Credentials zůstanou ve standardním přihlášení CLI nebo lokálním secret store mimo repo. Child proces dostává whitelist prostředí, ne celé `process.env`; zejména nepředávat hub/Linear/storage tokeny implementerovi. Nepřepínat automaticky na API klíče nalezené v shellu.

Používat syntetická data. Trace, síťový log a screenshot mohou obsahovat citlivá data; před exportem použít allowlist artefaktů, kontrolu tokenů a citlivých cest. Binární trace nelze spolehlivě „vyčistit“ pouhým nahrazením textu — při podezření ho nezveřejnit. Produkční storage state/cookies se nikdy nepublikují.

Výchozí limity: 10 GiB artefaktů, uchování 14 dní, chránit připnuté a neschválené běhy. Jsou konfigurovatelné. Při nedostatku disku pozastavit nové běhy; neodmazat rozpracovaný kód. Retention odstraňuje jen vlastní archivované artefakty podle pravidel, ne zdrojová repozitáře.

## 19. Gate policy a lidské schválení

Controller počítá odděleně `repoChecks`, `review`, `integrationQa`, `nativeQa`, `evidenceIntegrity`, `humanApproval`. Celkový výsledek není prostý AND nad několika zelenými ikonami: required a optional checks musí být součást schváleného QA profilu.

Automatický gate lze splnit pouze při úspěchu všech required strojových kontrol, platném snapshotu, úplném review pokud bylo required, bez otevřených P0/P1 a s neporušenými důkazy. `not_run`, `blocked`, prázdná suite a `flaky` nesmějí být převedeny na PASS. Scénář určený jako manual zůstává vyžadovaným lidským krokem.

Člověk může odmítnout false-positive nebo vědomě přijmout riziko s důvodem. Taková výjimka zůstane výjimkou, nikoli zeleným testem. Potvrzení se váže na snapshot a nezměněný testovací plán. Po změně kódu/rebase, testovacího scope nebo integračních pins vzniká nová verze a schválení se nepřenáší.

Report „verified“ znamená schválení testované sestavy, nikoli nasazení. Před případným rolloutem je potřeba znovu ověřit shodu nasazované sestavy s testovanou. Multi-repo změna není automaticky atomický release.

## 20. Definition of Done a první pilot

Podrobné akceptační testy jsou v `ACCEPTANCE_TESTS.md`. V1 není dokončená, pokud se pouze zobrazují seedovaná data nebo fake provider výsledky bez možnosti skutečného běhu.

Implementace musí dodat `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm doctor`, `pnpm demo`, `pnpm lint`, `pnpm typecheck`, `pnpm test` a `pnpm test:e2e`. Příkazy jsou požadované výstupy budoucí aplikace, nikoli už existující příkazy tohoto zadání.

Pilot: jeden produkt, tři repozitáře, jeden cross-repo scénář, dva současné tasky, jeden vadný a jeden úspěšný běh. Začít `review_qa` nad hotovými branches. Měřit lidské minuty na ověření, čekání ve frontě, počet odhalených regresí, false-positive review, počet znovuotevřených tasků a skutečnou spotřebu, pokud ji provider poskytne. Po prvních zhruba deseti reálných změnách vyhodnotit přínos; neslibovat předem konkrétní procentní zrychlení.

## 21. Neznámé vstupy a postup bez blokování vývoje

Nejsou dodané přesné lokální cesty, příkazy projektů, QA účty, baseline revize, skutečné Linear ID/stavy ani rozhraní interního hubu. Implementovat onboarding a demo fixtures. Chybějící integraci označit konkrétním blockerem; nepředstírat připojení a nevymýšlet produkční detaily.

Normativní je tato specifikace a akceptační testy. Příklady jsou ilustrační. Konkrétní CLI capability vždy ověřit na instalované verzi. Primární podklady a datum ověření jsou v `REFERENCES.md`.
