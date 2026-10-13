# Nástroj, model a integrační rozhraní

Ověřeno v primární dokumentaci 12. 10. 2026. Dostupnost se může lišit podle účtu,
klienta a jeho verze. Tyto poznámky nejsou naměřený benchmark obou nástrojů.

## Doporučená implementační session

**Codex: GPT-6 Astra / High.** OpenAI uvádí Astra pro nejsložitější úlohy přes více
kroků a nástrojů. Zde doporučuji High kvůli scheduleru, procesům a bezpečnosti;
Extra High pouze pro složité ohraničené části. Pro rutinní navazující úpravy lze
po ověření kvality použít GPT-6.1 Sol, který OpenAI nabízí jako levnější alternativu
pro dlouhodobější práci. Není to důvod přepínat model automaticky. [S1]

Interaktivní spuštění v novém adresáři projektu:

```bash
codex -m gpt-6-astra -c 'model_reasoning_effort="high"'
```

CLI konfigurační klíč `model_reasoning_effort` respektuje hodnoty konkrétního modelu.
Nepředpokládat stejný katalog effort pro všechny modely. [S4]

## Nezávislé review

**Claude Code: Claude Opus 5.5 / High.** Doporučení pro ověřování tohoto projektu,
nikoli požadavek, aby uživatel kupoval další předplatné. Alternativně může veškerou
implementaci dělat Claude Code a Codex provádět review. Oficiální model ID je
`claude-opus-5-5`; model podporuje effort High. [S5]

```bash
claude --model claude-opus-5-5 --effort high
```

Uvedené příkazy mění parametry této session. **Nejde o kompletní sandbox konfiguraci
produkčního orchestrátoru.** Do session následně vložit příslušný PROMPT soubor.

## Podporované integrační body pro vznikající hub

### Codex adapter

Použít `codex exec`, stream `--json`, finální výstup `--output-last-message` a podle
capability `--output-schema`. Proces využívá podporované uložené CLI přihlášení.
Výstup je nutné rozlišit na události a konečný výsledek, nikoli grepovat „success“.
Pro writer explicitní workspace-write sandbox; pro reviewer read-only. [S2, S3]

Pro automatické zjištění dostupných modelů/effort lze použít oficiální app-server
metodu `model/list`. Není nutné kvůli tomu převádět celý runtime na app-server;
execution v1 může zůstat nad exec. Katalog z konfigurace je přípustný fallback,
ale jeho dostupnost musí mít stav unverified/verified, nikoli být vydávána za
seznam modelů skutečně povolených účtem. [S15]

### Claude Code adapter

Použít neinteraktivní `claude -p`; strojový výstup `--output-format json` nebo
`stream-json`. Streamovací režim používá `--verbose`; strukturovaný výstup přes
`--json-schema` je nutné vyzvednout z odpovídající finální obálky. Konkrétní kombinaci
flags ověřit live capability testem. [S6]

Pro reviewer ověřit `--restricted`, omezit built-in nástroje přes `--tools` pouze na
čtení a zakázat nepovolené MCP nástroje. `--allowedTools` sám není zákaz ostatních
nástrojů. Nepoužít `--dangerously-skip-permissions`. Chybějící bezpečnostní capability
znamená blokovaný adapter, ne degradaci na neomezený proces. [S7]

## Povinný lokální capability spike před implementací adapterů

1. Zjistit cestu a `--version`, načíst lokální help pro použité subcommands.
2. Ověřit JSONL a finální obálku na minimální úloze v dočasném demo adresáři.
3. Ověřit schema-output, chybový exit, timeout a cancel celé process group.
4. Pro review provést pokus o zápis a čtení mimo povolený export, ověřit restrikce.
5. Uložit redigovaný fixture skutečného protokolu, verzi a datum jako regression test.

Runtime musí předat prompt jako samostatný argument nebo stdin, nikoli shellovou
interpolaci. Nastavení jednotlivých agentů nesmí upravovat globální CLI config.
Do interních veřejných logů neukládat celé provider transcripts bez redakce.

Limity času, počtu tahů a review kol vynucovat samostatně. Spotřebu a actual model
brát ze skutečných provider metadat, jsou-li dostupná; jinak `unknown`.
Neslibovat přesný dolarový limit pro subscription usage a nezobrazovat nulu jako
náhradu chybějící cenové informace. LLM služba je nadále vzdálená, i když worker
běží lokálně.
