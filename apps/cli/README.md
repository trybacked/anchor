# @trybacked/cli

**`backed`** command-line interface for the Anchor ontology engine.

---

## Quick start

```bash
cd your-workspace
backed anchor init
backed anchor pull        # Databricks env in .env → model.yaml
backed anchor sync
backed anchor deploy
```

Global install: `pnpm build && cd apps/cli && pnpm link --global`.

---

## Commands

| Command  | Purpose                                          |
| -------- | ------------------------------------------------ |
| `init`   | Workspace `.backed/config.yaml`                  |
| `pull`   | Warehouse schema → `model.yaml`                  |
| `sync`   | Versioned registry snapshot (`--status` to list) |
| `deploy` | MCP for agents                                   |

Top level: `backed version` · `backed anchor …`

Legacy aliases: `discover` → `pull`, `register` / `publish` → `sync`, `serve` → `deploy`.
