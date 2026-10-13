# Onboarding vlastního produktu

Pro explicitně vybrané Happenee repozitáře je připravený [generátor lokálního profilu včetně automatických review skills](HAPPENEE_SETUP.md). `reviewSkills` obsahuje schválené cesty a SHA-256, `reviewContext` relevantní dokumenty. Obsah se při Start ověří a zmrazí; chybějící required kontext nedovolí úplný review PASS. Skills nepřidávají oprávnění CLI.

## Projekt a revize

V přepínači projektu (vlevo nahoře) zvolte **New project**. Průvodce má tři kroky: název, repozitáře a AI modely. U každého repozitáře zadejte složku (lze i `~/…`) a zvolte **Check**: hub jen čte (`git rev-parse`, seznam větví, `git status`) a ověří, že jde o kořen repozitáře mimo vlastní data hubu. Baseline vyberete z nabídky větví. Potvrzení „trusted repositories“ je povinné. Registrace sama nic nespouští.

Po založení pokračujte v **Project settings → Tests**: *Surfaces* (co se testuje), *Commands* (příkazová řádka se rozloží na argv bez shellu; typ Check / Test suite / Build / Start service) a *Scenarios* (očekávané chování, povinnost, ověřující suite). Bez alespoň jednoho povinného automatizovaného scénáře run neprojde QA; UI na to upozorní. Runtime služby, native/Maestro, review skills/context, exclusive resources a required test paths se upravují jako validovaný JSON v **Project settings → Advanced**. Úprava projektu nepřepisuje historii: každý run má vlastní neměnnou kopii konfigurace. Projekt lze archivovat (skryje se, historie zůstane) a v App settings → Archived projects obnovit.

Stejnou strukturu lze registrovat i z příkazové řádky (`scripts/onboard-project.ts`). Příklad níže je šablona formátu odpovídající `packages/contracts/src/index.ts`; cesty, scénáře a skripty nahraďte skutečnými hodnotami svého projektu.

```json
{
  "name": "My product",
  "trusted": true,
  "repositories": [{"key": "app", "sourcePath": "/absolute/approved/repository", "baselineRef": "main"}],
  "surfaces": [{"key": "admin", "repoKey": "app", "kind": "web"}],
  "commands": [{
    "id": "integration", "repoKey": "app", "executable": "node",
    "args": ["scripts/hub-qa.mjs"], "cwd": ".", "timeoutSeconds": 300,
    "kind": "suite", "phase": "qa", "reportPath": "build/hub-result.json",
    "envRefs": [], "resourceIds": [],
    "artifacts": [{"id": "admin-screen", "path": "build/admin.png", "scenarioId": "registration", "surfaceKey": "admin"}]
  }],
  "scenarios": [{"id": "registration", "title": "Registration in admin", "required": true, "kind": "web", "surfaceKeys": ["admin"], "expected": "The newly registered participant appears in admin", "commandId": "integration"}],
  "requiredTestPaths": [{"repoKey": "app", "path": "scripts/hub-qa.mjs"}],
  "exclusiveResources": []
}
```

Pouze commitnuté změny se importují. Dirty source zůstává nedotčený a v Changes je upozornění. Zdrojová cesta je svázána s canonical path a filesystem identitou. Změna této identity vyžaduje novou registraci. Aktivní agent konfigurace, symlinky, `.env`, klíče, build/cache soubory a rozpoznané credentials nejsou povolený agentní kontext; pro takové repo připravte sanitizovaný zdroj. V1 není sandbox pro cizí nedůvěryhodný kód.

New task: zvolte ref pro každé repo (nabídka větví), acceptance criteria a režim (výchozí Review + QA = `review_qa`). Dialog před startem ukáže souhrn toho, co se spustí, a upozorní na neověřený model nebo chybějící povinný scénář. **Save and start run** task uloží a výslovně spustí; **Save for later** jen uloží. Start uloží účinnou konfiguraci, SHA všech komponent a otisky required testů. Související issues lze uvést společně; integration set tvoří předem připravené refs/SHA, hub je nemerguje. Dependency pin má `{ "issue": "TEAM-123", "repoKey": "app", "sha": "40-character-commit-sha" }` a musí odpovídat zvolené sestavě. Změna plánu vyžaduje nový task/run. **Accept findings and prepare a fix** připraví nový explicitní task nad checkpoint snapshotem.

## Provideři

App settings obsahuje AI connections, katalog modelů (Models), výchozí modely (Default models), kapacitu a úložiště. Výchozí modely projektu (Project settings → AI models) přebíjí globální; task přebíjí projekt. Model/effort ID se neodvozuje z marketingového názvu. Pro reálný provider zvolte **Check installation**, přihlaste oficiální CLI mimo hub a pak výslovně **Send test prompt** s konkrétním modelem. Výběr modelu v UI ukazuje, zda model prošel testem; neověřený model run zablokuje. Ověření modelu je vázané na CLI verzi. CLI update vyžaduje nový smoke. Aktuální detekované verze/stavy jsou v `evidence/provider-doctor-final.jsonl`.

Hub nepoužívá API-key fallback ani nemění globální CLI config. Reviewer dostává read-only export, připnuté SHA/diffy, výsledky kontrol a předchozí findings; nedostává implementerovo zdůvodnění. Codex má zakázané shell/exec nástroje pro reviewer; Claude používá prázdný tool allowlist a prázdný MCP config. Implementer pracuje v managed worktrees; controller spouští schválené testy. Instalace balíčků/modelový network není automatizovaný krok v1 — potřebné závislosti řešte explicitním schváleným profilem. `maxTurns` ponechte `null`, dokud daný limit nemá ověřenou capability; timeout se vynucuje procesně.

## QA příkazy, runtime a credentials

`kind=check/build` používá skutečný exit code. `kind=suite` navíc vyžaduje úplný `contracts/qa-result.schema.json`: suite/run/snapshot ID, source=runner, čas, exit code, výsledky se všemi assertions a nejméně jedním skutečným testem. Vzor formátu je `examples/qa-result.example.json`. Skript dostane `HUB_RUN_ID`, `HUB_SNAPSHOT_ID`, `HUB_RUNTIME_DIR` a `HUB_RUNTIME_PORTS`. `evidenceIds` obsahují ID ze schváleného `command.artifacts`; controller je po ověření skutečných souborů převede na uložená artifact ID.

Artefakty a reporty runneru zapisujte do schválených ignorovaných build adresářů (`build/`, `dist/`, `coverage/`, `artifacts/`). Změna zdrojů při testu zablokuje gate. Required testy nelze odstranit, přeskočit ani změkčit bez nového explicitně schváleného scope. Příkazy musí být neinteraktivní; žádné shellové řetězce z issue nebo modelového výstupu.

Pro lokální backendy doplňte start commands a runtime, například:

```json
{
  "runtime": {
    "isolation": "isolated",
    "services": [{"key": "backend", "commandId": "start-backend", "portKey": "backend", "readinessPath": "/health", "identityField": "runId", "identityValue": "{{run.id}}"}]
  }
}
```

`start-backend` musí být schválený `kind=start` command. Jeho args mohou používat `{{ports.backend}}`, `{{paths.runtime}}`, `{{paths.worktree}}`, `{{run.id}}`, `{{snapshot.id}}` a `{{revisions.app}}`. Služby startují v uvedeném dependency pořadí a readiness musí potvrdit vlastní run/revizi. DB, cache, uploads a testovací účty musí používat izolovaný runtime adresář/namespace; samotný odlišný port nestačí. Pro sdílené QA nastavte `runtime.isolation=shared` a `exclusiveResources`, například `["staging-db"]`. Command `resourceIds` a `kind=build` se zamykají také; native device má vlastní lock.

QA credential references se konfigurují v `envRefs`. Například `"envRefs": ["TEST_PASSWORD"]` načte **jen pro schválený QA příkaz** proměnnou workeru `HUB_QA_TEST_PASSWORD` do jeho `TEST_PASSWORD`. Chybějící hodnota blokuje krok. Hodnotu zadejte v lokálním prostředí mimo UI/DB/repo; nejde agentům ani browseru. Nikdy nepoužívejte produkční credentials. Runtime manifest procesu je lokální soubor s mode 0600 a nepublikuje se. Rezervované systémové proměnné nelze takto přepsat.

## Native

Native povrch deklarujte jako `native_ios`/`native_android`. Konfigurace `native` vyžaduje existující `flowPath` ve vybraném repo, `deviceId`, `applicationId`, `platform`, `buildFingerprint`, `runtimeVersion`, `revision`, loopback `endpoint` a `verificationCommandId`. Verifikační příkaz musí JSONem potvrdit přesnou identitu build/device/backendu; hodnoty se jen neodhadují z názvu aplikace. Maestro flags se před spuštěním ověřují z nápovědy.

Pro více native scénářů přidejte `testNamesByScenario`, mapu scenario ID → přesné JUnit testcase names. Nepokrytý scénář zůstane NOT_RUN. Native knihovny nebo runtime změny mohou vyžadovat nový ručně připravený build. Hub provisioning/signing/EAS Update neprovádí. Bez CLI, zařízení, buildu a flow je live native test **NOT_RUN**. Screenshot mobilního browseru ani ruční PNG z toho nevytvoří native PASS.

## Evidence, schválení a export

Detail má Overview / Changes / Review / Tests / Evidence / Logs. P0/P1 a chybějící required coverage blokují gate; P2/P3 zůstávají viditelné. Dispute/false-positive/accept-risk zapisují autora, důvod a snapshot. Záznam výjimky nemění testový FAIL na PASS ani sám nezpřístupní verified; pro pokračování připravte nový schválený scope/run. Human approval je možný po splnění strojových gates a potvrzení required manual kroků. Baseline freshness lze zkontrolovat v Overview; stale sestava potřebuje nový run.

Neúspěšné QA ukládá finding s odkazem na skutečný výsledek a evidence. V Tests akce **Prepare fix from QA findings** otevře nový task nad stejným snapshotem se zachovanými požadavky a popisem selhání. Primární **Save** opravu nespouští; spuštění je samostatná akce (Start run nebo Save and start run). Blocked/not_run není automaticky označen za chybu kódu.

Ruční PNG vyžaduje autora, scénář a source label. Automatické real-project artefakty i manual evidence jsou `review_required`; v galerii otevřete **Review for export**, zkontrolujte skutečný soubor a potvrďte syntetická data. To nevypíná automatické token/hash/ZIP kontroly. Neredigovatelný citlivý trace se zablokuje. DEMO evidence je předem syntetická. Chybějící baseline nemá before/after srovnání.

V App settings → Report folders schvalte existující filesystem složku mimo hub data a zdrojová repa. V terminal runu zvolte **Publish evidence pack**. Export má tvar `delivery-hub/<project>/<task>/<run>/<snapshot>/<manifest-hash>/`; obsahuje self-contained `index.html`, `report.json`, manifest, artefakty a `publication.json` receipt. Nové výsledky/schválení vytvářejí novou revizi, starší export se nepřepisuje. Retry exportu nespouští QA. Automatické publikování zůstává vypnuté; konkrétní interní API není nakonfigurováno.

Pause/Cancel ukončí vlastní process groups. Retry vytváří nový run s čerstvě připnutým source refem; pro pokračování checkpointu vytvořte task přes Accept findings. Po pádu/spánku worker reconciliuje vlastní procesy a označí práci Interrupted. Neurčitá identita procesu ponechá leases a blokuje nové runy; uživatel nejprve prověří uvedené procesy a znovu spustí worker. Nepoužívejte killall ani plošné mazání checkoutů.

Výchozí retention je 10 GiB / 14 dní. App settings → Storage ukáže kandidáty; ruční cleanup maže jen evidence konkrétního archivovaného, schváleného, nepřipnutého runu po retenční lhůtě. Zdrojové worktrees a publikované kopie zachová. Při nízkém volném disku či překročení kvóty nové runy čekají. SQLite DB musí být na lokálním disku, ne na síťovém share.

## Linear a pilot

Volitelný `HUB_LINEAR_TOKEN` patří do prostředí workeru. Stav tokenu ukazuje App settings → Linear; import je v dialogu New task → **From Linear** a načte pouze konkrétní issue, kritéria a relevantní relations. Žádný Start ani změna issue. Nevyřešený blocker vyžaduje explicitní kompatibilní SHA; stav Done není doklad nasazení.

První firemní pilot: uživatel explicitně vybere repo paths a bezpečné lokální příkazy, spustí review_qa hotové změny a posoudí report; poté dva izolované runy (úspěšný + regrese). Změřte lidské QA minuty a reportované usage. Tento pilot během implementace neproběhl.
