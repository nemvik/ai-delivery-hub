# Pravidla implementace AI Delivery Hub

- Primární zadání je SPEC.md; pořadí IMPLEMENTATION_PLAN.md; akceptace ACCEPTANCE_TESTS.md.
- Jde o lokální nástroj pro jednoho uživatele. Preferuj malé explicitní komponenty, ne vlastní agentní framework.
- TypeScript strict. Veškeré externí vstupy validuj. Příkazy spouštěj s argv polem, ne shellovou interpolací.
- Dlouhé procesy běží v samostatném workeru; API je pouze řídicí rozhraní.
- Durable stav je v SQLite. Idempotence, resource locking, cancel a restart recovery jsou funkční požadavky.
- Jeden writer na run. Reviewer nesmí měnit kód. Review a QA se vážou na immutable snapshot.
- Models/providers jsou konfigurovatelné. Nehardcoduj katalog do business logiky ani nezaměňuj requested/actual model.
- Nedělej automatický push, PR, merge, deploy ani zápisy do Linearu. Žádné produkční testy.
- Nečti ani neměň firemní repozitáře před explicitním onboardingem. Demo fixtures vytvářej uvnitř spravované testovací složky.
- Přihlášení CLI používej podporovaně. Nekopíruj auth tokeny, neobcházej permissions a neměň globální konfiguraci uživatele.
- Fake data/fake provider smějí být jen v jasně označeném demo/test režimu.
- Chybějící credentialy nebo emulátor znamenají NOT_RUN/BLOCKED, nikoli PASS.
- Testuj nejprve negativní scénáře: duplicate start, cancel, restart, stale snapshot, invalid review, collision, traversal.
- Neklaď běžné implementační otázky, které lze vyřešit spec nebo lokálním průzkumem. Skutečné neznámé integrace řeš onboardingem.
- Po milníku aktualizuj IMPLEMENTATION_STATUS.md. Rozliš implementováno / otestováno / neověřeno.
- Zdroje CLI jsou v REFERENCES.md. Ověř skutečnou verzi a capability; při nesouladu selži bezpečně, nezapínej bypass.
- Před finálním předáním spusť lint, typecheck, unit/integration, build a browser E2E; u nedostupné integrace popiš důvod.
