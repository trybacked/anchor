# @trybacked/cli

**`backed`** command-line interface for the Anchor ontology engine.

---

## Quick start

```bash
cd your-workspace
# .env: BACKED_ENGINE=files, AI_GATEWAY_API_KEY=…, BACKED_FILES_ROOT=./sources
backed anchor init
backed anchor run          # ingest → AI induce → AI extract → eval → sync
backed anchor deploy
```

Global install: `pnpm build && cd apps/cli && pnpm link --global`.

---

## Commands

| Command  | Purpose                                          |
| -------- | ------------------------------------------------ |
| `init`   | Workspace `.backed/config.yaml`                  |
| `run`    | Full AI document pipeline → `model.yaml`         |
| `sync`   | Versioned registry snapshot (`--status` to list) |
| `deploy` | MCP for agents                                   |

Top level: `backed version` · `backed anchor …`

Legacy aliases: `discover` → `run`, `register` / `publish` → `sync`, `serve` → `deploy`.
