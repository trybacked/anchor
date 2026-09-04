# @backed/cli

Local-first CLI. Command orchestration only, no domain logic. User-facing copy in English.

## Commands

| Command | What it does |
|---|---|
| `backed init [folder]` | Create `.backed/config.yaml` with the sources folder (default `./sources`) |
| `backed model [folder]` | Ingest → profile → `profile.json`, then semantic bursts → `proposal.json` |
| `backed review` | Interactive review of all uncertain proposals → `review.json` + `modello.yaml` |
| `backed diff` | Compare the last two runs → `diff.json` + English report |
| `backed serve` | MCP stdio server on `modello.yaml` (tools: `list_entities`, `get_entity`, `list_relations`, `search_model`) |

## Example

```bash
cd client-folder
backed init ./sources
backed model            # requires AI_GATEWAY_API_KEY in .env
backed review           # confirm/correct → writes modello.yaml
backed serve            # AI agents query the ontology via MCP
backed model && backed diff   # re-run when data changes
```

Environment variables (via `.env`, never committed — see `.env.example`): `AI_GATEWAY_API_KEY` (required for AI), `SEMANTIC_MODEL_CHEAP`, `SEMANTIC_MODEL_FRONTIER` (optional).

Global install: from repo root, `cd apps/cli && pnpm link --global` (the monorepo root has no bin).

Errors are always explained in English; exit code 1 on failure.
