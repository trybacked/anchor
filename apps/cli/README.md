# @backed/cli

Local-first CLI. Command orchestration only, no domain logic. User-facing copy in English.

## Operational workflow

```bash
cd client-folder
mkdir -p sources

backed init              # interactive: document types, sources folder
# edit .backed/config.yaml if needed

backed model             # ingest → profile → proposal (needs AI_GATEWAY_API_KEY)
backed review            # confirm/correct → model.yaml
backed serve             # MCP for agents

backed model && backed diff   # when sources change
```

### `backed init`

Requires an interactive terminal. Writes `.backed/config.yaml` with:

- **`sourcesDir`** — where CSV, Excel, PDF, etc. live (default `./sources`)
- **`documentTypeHints`** — filename slug rules for document classification (no runtime defaults; empty list = LLM for every document)

Document type presets are init-time templates only; at inference time only `config.yaml` rules apply.

### `backed model`

Stages: ingest → document extraction (if PDFs/TXT) → chunk/embed → profile → semantic proposal.

Requires `AI_GATEWAY_API_KEY` in workspace `.env`. Writes `.backed/data.duckdb` and `.backed/runs/<id>/`.

## Commands

| Command | What it does |
|---|---|
| `backed init [folder]` | Interactive workspace setup → `.backed/config.yaml` |
| `backed model [folder]` | Full pipeline → `proposal.json` (+ `documents.json` when documents present) |
| `backed review` | Risk-ranked questions → `review.json` + `model.yaml` |
| `backed diff` | Compare last two runs |
| `backed serve` | MCP stdio on `model.yaml` + read-only DuckDB |

Environment variables (`.env` in workspace root): `AI_GATEWAY_API_KEY` (required for model), `SEMANTIC_MODEL`, `SEMANTIC_EMBEDDING_MODEL`.

Global install: `cd apps/cli && pnpm link --global`.

Errors are always explained in English; exit code 1 on failure.
