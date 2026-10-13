Implementuj v tomto repozitáři aplikaci AI Delivery Hub podle přiloženého zadání.

Nejprve přečti AGENTS.md, SPEC.md, IMPLEMENTATION_PLAN.md, ACCEPTANCE_TESTS.md,
PROVIDERS.md, contracts/ a examples/. Zkontroluj, zda zde už nějaká aplikace není;
pokud ano, rozvíjej ji a nepřepisuj bezdůvodně existující práci. Zjisti dostupné
lokální vývojové nástroje a skutečné verze CLI. Nevymýšlej jejich parametry.

Cíl je funkční lokální webový hub na MacBooku: multi-repo Git worktrees,
konfigurovatelný Codex/Claude implementer a reviewer, omezený opravný cyklus,
paralelní běhy s izolací prostředků, deterministické testy, screenshoty a reporty.
Hlavní užitek je review a QA již hotových změn, ne automatické zpracování backlogu.

Dodrž stack a hranice v SPEC.md. Odděl dlouho běžící worker od Next.js requestů.
Workflow, permissions, resource locks a PASS/FAIL určuje deterministický kód,
ne text modelu. Model pouze implementuje nebo vrací strukturované nálezy.

Postupuj po milnících z IMPLEMENTATION_PLAN.md. Po krátkém počátečním plánu
začni rovnou implementovat. Nezastavuj se po scaffoldu nebo design mockupu.
Po každém milníku spusť relevantní testy a aktualizuj IMPLEMENTATION_STATUS.md
s tím, co opravdu funguje, jaké příkazy proběhly a co nebylo možné ověřit.
Při běžném technickém rozhodnutí zvol nejjednodušší variantu odpovídající spec.
Ptej se jen při skutečném konfliktu požadavků nebo před rizikovou externí akcí.

Dokonči fungující demo bez credentials se skutečnými dočasnými Git repozitáři,
reálně spuštěným testovacím webem a skutečnými Playwright artefakty. Fake provider
smí být použit jen pro deterministický demo/test režim a musí mít viditelný štítek.
Současně implementuj reálné Codex/Claude adaptery. Jestli chybí lokální přihlášení,
neoznačuj jejich live smoke test za provedený. Dodej akci Doctor/Test connection.

Nejsou známé konkrétní cesty firemních repozitářů, jejich startovací příkazy,
QA credentials ani rozhraní interního hubu. Nedoplňuj je odhadem. Implementuj
onboarding formulář, validaci a lokální filesystem export. Reálnou integraci
bez potřebných údajů označ jako nenakonfigurovanou; ostatní vývoj tím neblokuj.

Nevyžaduj nové placené LLM API. Využij podporované přihlášení oficiálních CLI.
Neměň globální nastavení těchto nástrojů. Neinstaluj globální software bez souhlasu.
Žádný automatický push, PR, merge, produkční deploy, EAS Update, migrace produkční DB
ani zápis do Linearu. Neskenuj a neměň cizí pracovní projekty mimo explicitní výběr.

Dbej zvlášť na: cancel celé vlastní process group; ochranu před dvojím workerem;
reconciliation po restartu/spánku; fixní SHA všech komponent; vazbu review a testů
na snapshot; oddělené porty, DB a testovací data; stale approvals; read-only reviewer;
CSRF a path traversal; redakci secrets; idempotentní publikování výsledků.

Závěr musí obsahovat přesné příkazy ke spuštění, seznam dokončených milníků,
skutečné testovací výsledky a oddělený seznam neověřených integrací.
Nic netvrď jako otestované bez procesu, výsledku a odpovídajících artefaktů.
