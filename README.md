# AI Delivery Hub

Lokální aplikace pro explicitně spuštěné multi-repo review a QA. Next.js dashboard, samostatný Node worker, SQLite WAL, vlastní Git worktrees, skutečné testy a reporty s vazbou na neměnný snapshot. Demo nepotřebuje LLM ani Linear credentials.

## Spuštění

Ověřeno na Node **22.23.1**, pnpm **11.24.0**, macOS. Příkazy spouštějte v kořeni tohoto projektu:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
export HUB_DATA_DIR="$PWD/.hub-data"
pnpm demo
pnpm dev
```

Otevřete **http://127.0.0.1:3000**, v Tasks zvolte **Start run**. `pnpm dev` spouští web i worker. Demo vytváří tři skutečné Git repozitáře pouze v `$HUB_DATA_DIR/fixtures`, spustí lokální web a Playwright registraci → admin. Testovací client/service jsou knihovny, nikoli native aplikace. Opravný cyklus používá viditelně označený DEMO provider.

Produkční sestavení lokální aplikace:

```sh
pnpm build
HUB_DATA_DIR="$PWD/.hub-data" pnpm start
```

`start` používá stejný samostatný worker a bind pouze na `127.0.0.1`. `Ctrl+C` ukončí vlastní procesy. Bez `HUB_DATA_DIR` se používá `~/.ai-delivery-hub`; web a worker musí mít stejnou cestu. Volitelně lze změnit `HUB_PORT` pro oba procesy. Nespouštějte `dev` a `start` současně nad jednou DB.

```sh
HUB_DATA_DIR="$PWD/.hub-data" pnpm run doctor
```

V pnpm 11 je `pnpm doctor` vestavěná diagnostika pnpm. Pro diagnostiku **hubu** je nutné `pnpm run doctor` nebo Settings → Doctor. Tato akce kontroluje CLI verzi, flags a přihlášení, nespouští inference. **Test connection** je samostatná výslovná akce se spotřebou účtu.

## Ověření

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Integrační testy používají vlastní dočasné repozitáře/procesy; browser E2E používá `.test-data/` a port 4317. Potřebují oprávnění spouštět lokální procesy, číst jejich identitu a bindovat loopback. Nejde o produkční testy. `pnpm test:integration` je samostatný vstup pro integrační sadu. Přesný příkaz cíleného testu: `pnpm exec vitest run tests/integration/m5.test.ts`.

[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) obsahuje výsledky milníků, všech AT01–AT40, použité příkazy a konkrétní důkazy. [Návod k onboardingu](docs/ONBOARDING.md) popisuje vlastní projekt, připnuté revize, testovací příkazy, QA credentials, native prostředí a export.

## Co aplikace dělá

- Ruční task nebo explicitní read-only Linear import; Start je vždy samostatný.
- `review_qa`, `implement_review_qa` (nejvýše 3 review / 2 opravy) a `qa_only`.
- Immutable konfigurace a SHA; globální → projektové → taskové defaulty rolí; requested/actual model odděleně.
- Resource locks, omezený souběh, izolované runtime manifesty, readiness, pause/cancel a konzervativní restart recovery.
- Výsledky `passed/failed/blocked/not_run/skipped/flaky`, screenshoty, trace/video, ruční evidence, human approval konkrétního snapshotu.
- Samostatný HTML/JSON report, hash manifest a idempotentní filesystem export s oddělenými revizemi a receipts.
- Session/CSRF, validace cest, kontrola integrity/citlivosti, retention preview a explicitní mazání pouze schválených archivovaných důkazů.

Skutečný Codex CLI smoke a `review_qa` nad demo repozitáři byly ověřeny; výsledky jsou v IMPLEMENTATION_STATUS. Pro tři Happenee repozitáře je připravený [generátor nastavení a automatické review skills](docs/HAPPENEE_SETUP.md). Konkrétní místní profily a adresář `evidence/` nejsou součástí veřejného repozitáře. Claude inference, Maestro device/build, živý Linear import a firemní QA pilot zůstávají **NOT_RUN**. Interní HTTP hub nemá zadané rozhraní; v1 používá vybranou filesystem složku.

Výslovné zopakování skutečného Codex smoke + review spotřebuje usage přihlášeného účtu. Předpokládá běžící hub a existující demo:

```sh
pnpm exec tsx scripts/verify-codex.ts
# Jen další review po ověřeném smoke:
pnpm exec tsx scripts/verify-codex.ts --review-only
```

Requested model/effort lze nastavit přes `HUB_CODEX_MODEL` / `HUB_CODEX_EFFORT`. Pokud CLI actual model nehlásí, UI pravdivě ukáže `unknown`.

Specifikace a původní příklady zůstávají v `SPEC.md`, `PROVIDERS.md`, `contracts/` a `examples/`. Runtime validátory aplikace jsou v `packages/contracts/src/index.ts`; původní návrhové TypeScript kontrakty nejsou druhou implementací.
