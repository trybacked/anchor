# @backed/cli

Local-first CLI. Command orchestration only, no domain logic. User-facing copy in English.

## Operational workflow

```bash
cd client-folder
mkdir -p sources

backed init              # interactive: optional filename rules, sources folder
# edit .backed/config.yaml if needed

backed model             # ingest → profile → proposal (needs AI_GATEWAY_API_KEY)
backed review            # confirm/correct → model.yaml
backed serve             # MCP for agents

backed model && backed diff   # when sources change
```

### `backed init`

Requires an interactive terminal. Writes `.backed/config.yaml` with:

- **`sourcesDir`** — where CSV, Excel, PDF, etc. live (default `./sources`)
- **`documentTypeHints`** — filename keyword rules (see README). One keyword per rule; repeat the same `documentType` for aliases (`invoice`, `inv`, …). Empty = LLM for every document.

At inference time only `config.yaml` rules apply — no built-in document types.

### `backed model`

Stages: ingest → document extraction (if PDFs/TXT) → mentions/facts → chunk/embed → profile → semantic proposal.

Document corpora run deterministic mention and fact extraction (`ensureCurrencyFactTypes` → `extractMentionsFromLines` → `extractFactsFromLines` → `materializeFacts`) before profiling. Facts live in `.backed/data.duckdb`; they are not backfilled from older snapshots.

**After upgrading fact extraction**, re-run `backed model` on existing workspaces so `document_facts` and entity rollups reflect the improved parser.

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
