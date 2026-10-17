# @trybacked/cli

**`backed`** command-line interface for the Backed platform: **Anchor** (ontology) and **Falcon** (UI capture).

---

## Quick start

```bash
cd your-workspace
# .env: BACKED_ENGINE=files, AI_GATEWAY_API_KEY=…, BACKED_FILES_ROOT=./sources
backed anchor init
backed anchor run          # ingest → AI induce → AI extract → eval → sync
backed anchor deploy
```

Global install (unified npm package): `npm install -g @trybacked/backed`.

Monorepo dev: `pnpm --filter @trybacked/cli build && pnpm link --global --filter @trybacked/cli`.

---

## Commands

| Command  | Purpose                                          |
| -------- | ------------------------------------------------ |
| `init`   | Workspace `.backed/config.yaml`                  |
| `run`    | Full AI document pipeline → `model.yaml`         |
| `sync`   | Versioned registry snapshot (`--status` to list) |
| `deploy` | MCP for agents                                   |

Top level: `backed version` · `backed anchor …` · `backed falcon …` (Python; see `@trybacked/backed` README)

Legacy aliases: `discover` → `run`, `register` / `publish` → `sync`, `serve` → `deploy`.
