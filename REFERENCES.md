# Primární zdroje

Ověřeno 12. 10. 2026. Rozhraní je nutné znovu ověřit na verzi nainstalované u uživatele.
Některé původní OpenAI dokumentační adresy nyní přesměrovávají na ChatGPT Learn.
Návrh scheduleru, datového modelu, scope a limitů je vlastní doporučení tohoto zadání,
ne garantovaná vlastnost níže uvedených produktů.

| ID | Primární dokumentace | Použití v zadání |
|---|---|---|
| S1 | OpenAI — Models | Názvy Astra / GPT-6.1 Sol a doporučené oblasti použití. |
| S2 | OpenAI — Non-interactive mode | Codex exec, JSONL, structured output, uložené CLI přihlášení. |
| S3 | OpenAI — Developer commands | Parametry a sandbox režimy CLI. |
| S4 | OpenAI — Configuration Reference | Model a reasoning effort. |
| S5 | Anthropic — Model configuration | Claude model ID a effort. |
| S6 | Anthropic — Run Claude Code programmatically | Print mode, JSON/stream JSON a schema output. |
| S7 | Anthropic — CLI reference / Permissions | Restricted mode, tools a omezení oprávnění. |
| S8 | Git — git-worktree | Oddělené pracovní stromy a sdílená Git metadata. |
| S9 | Playwright — Trace viewer | Trace, kroky, DOM snapshoty a evidence. |
| S10 | Playwright — Parallelism | Paralelní workery a test isolation. |
| S11 | Maestro — Test reports and artifacts | Native reporty a screenshoty. |
| S12 | Expo — Runtime versions and updates | Kompatibilita nativního buildu a JS update. |
| S13 | Node.js — Child process | Spouštění procesů s odděleným argv a jejich řízení. |
| S14 | SQLite — Write-Ahead Logging | WAL provoz a omezení lokálního úložiště. |
| S15 | OpenAI — App Server | Dostupný model/list s capability metadaty. |
| S16 | Linear — GraphQL API | Budoucí read-only import zvoleného issue. |

## Adresy

```text
S1  https://developers.openai.com/codex/models/
S2  https://developers.openai.com/codex/noninteractive/
S3  https://developers.openai.com/codex/cli/reference/
S4  https://developers.openai.com/codex/config-reference/
S5  https://code.claude.com/docs/en/model-config
S6  https://code.claude.com/docs/en/headless
S7  https://code.claude.com/docs/en/cli-reference
    https://code.claude.com/docs/en/permissions
S8  https://git-scm.com/docs/git-worktree
S9  https://playwright.dev/docs/trace-viewer
S10 https://playwright.dev/docs/test-parallel
S11 https://docs.maestro.dev/maestro-flows/workspace-management/test-reports-and-artifacts.md
S12 https://docs.expo.dev/eas-update/runtime-versions/
S13 https://nodejs.org/api/child_process.html
S14 https://www.sqlite.org/wal.html
S15 https://developers.openai.com/codex/app-server/
S16 https://linear.app/developers/graphql
```

Součástí práce na tomto zadání nebylo připojení ke skutečným firemním repozitářům,
čtení skutečných Linear issues, volání interního hubu ani spuštění CLI na MacBooku.
Konkrétní repo cesty, testovací prostředí a hub adapter jsou proto onboarding vstupy.
