# Happenee setup

Hub podporuje tři repozitáře v jednom projektu: `happenee-mobile-app` (MOB), `happenee-service-app` (SERV) a `happeneeServer` (PLAT). Konkrétní cesty, schválené dokumenty a jejich hashe patří do lokálního profilu, který se neukládá do veřejného Git repozitáře.

## Vytvoření lokálního profilu

Po explicitním výběru vlastních checkoutů a lokálních Happenee skills spusťte v kořeni hubu:

```sh
HAPPENEE_ROOT="/absolute/path/to/Happenee" \
HAPPENEE_SKILLS_ROOT="/absolute/path/to/skills" \
node --import tsx scripts/prepare-happenee.ts

HUB_DATA_DIR="$PWD/.hub-data" node --import tsx scripts/onboard-project.ts config/happenee.project.json
```

Generátor očekává `happenee-mobile-app`, `happenee-service-app` a vnořený Git kořen `happeneeServer/happeneeServer`. Ověří místní baseline refs a uloží konfiguraci do `config/happenee.project.json`. Výchozí model/effort lze změnit přes `HUB_CODEX_MODEL` / `HUB_CODEX_EFFORT`; pro skutečnou roli je nutný úspěšný Test connection. Registrace nic nespouští a shodný profil nevytvoří podruhé.

## Automatický výběr skills

- `happenee-review-task`: navázané issue nebo změna některého z vybraných repozitářů.
- `happenee-cross-repo-pr-review`: změna platformy nebo issue PLAT.

Skills se přidávají až při výslovném Start review. `qa_only` je nepoužívá. Jejich schválený obsah a SHA-256 se při Start zmrazí do runu. Chybějící Company OS, KB nebo technické podklady znamenají neúplné review; controller nedovolí úplný PASS. Jde o read-only analytickou adaptaci, bez automatického komentáře na PR či dalších externích zápisů. Celé původní skills nejsou součástí tohoto repozitáře.

Firemní pilot vyžaduje konkrétní revize, vhodně vymezený review scope, explicitní dokumentační kontext a schválené příkazy nad izolovaným QA prostředím. Native QA vyžaduje ověřený build/device/endpoint. Vygenerovaný profil tyto chybějící integrace nepředstírá.

Další vhodné skills: QA readiness pro přípravu ověřeného testovacího prostředí a release compatibility pro kompatibilitu backendu, instalovaných klientů, značek a jazyků. Jde o návrhy, nikoli automaticky aktivované implementace.

Detailní místní onboarding může být uložený v ignorovaném `docs/HAPPENEE.md`. Profily, důkazy a firemní inventáře zůstávají lokálně; veřejný repozitář obsahuje generátor a testy.
