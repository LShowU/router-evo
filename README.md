# Router Evo

A DSH user preset focused on reducing first-turn prompt and tool-schema tokens.

## Included

- `preset/router-evo/`: Router Evo (default)
- `scripts/`: cache, checkpoint, repository map, compressed output, verification, context injection, cleanup
- `AGENTS.md`: concise agent operating rules
- `docs/`: design and activation notes

## First-turn routing

- Chat: no tools
- File/code task: `str_replace_editor` only
- Command/test task: shell only
- Second request: restore the full tool catalog

## Install

1. Copy `preset/router-evo` to `%USERPROFILE%\\.dsh\\.agent-presets\\router-evo`.
2. Set `agent-presets.default` to `router-evo` in DSH settings.
3. Start a new DSH session.

Do not commit API keys, session logs, caches, checkpoints, or machine-specific settings.
