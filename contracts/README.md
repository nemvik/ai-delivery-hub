# Kontrakty

`review.schema.json` je strukturovaný výstup reviewer modelu. Výsledek obsahuje
pouze nálezy a návrhy, ne autorizační příkazy. `qa-result.schema.json` je normalizovaný
výstup test runner adapteru nebo explicitního manual/demo importu, nikoli tvrzení
implementera o testech.

Všechna definovaná pole jsou povinná; nepřítomné hodnoty použijí `null`, kde je
schéma povoluje. Lokálně validovat JSON Schema a nad rámec něj sémantiku: existence
repo/path/line, shoda SHA/snapshotu, required coverage, integrita evidence, provenance
a smysluplné assertions. Validní JSON nikdy automaticky neznamená bezpečný obsah.

`adapters.ts` stanoví navržené rozhraní providerů a publisherů. Nejde o spustitelný
orchestrátor. Implementer má přidat zbytek doménového modelu a runtime validátory
podle SPEC.md, nikoli měnit tyto soubory za stuby vracející úspěch.

Příklad review/QA v examples/ je ilustrační a byl ověřen proti svému JSON Schema.
Nejde o výsledek skutečné analýzy firemního kódu nebo provedeného QA.
