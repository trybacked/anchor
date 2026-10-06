# Ontology discovery (docs / PDF pipeline)

Production flow to propose **new ontology objects** from curated `{catalog}.docs.*` tables (after PDF upload + `docs_refresh`), run a **structured review**, and merge into the tenant draft.

## Does it work?

It works when all of the following hold:

1. Control-plane deployed with `ontology_discovery_runs` (run `pnpm migrate` in control-plane).
2. Databricks SQL warehouse reachable from control-plane (`BACKED_DATABRICKS_*`).
3. PDFs landed and **`docs_refresh`** completed (tables such as `{catalog}.docs.documents` exist with rows).
4. Caller uses gateway auth with **editor** role (or internal token + `X-Backed-User`).

The propose step profiles tables **by FQN** (`catalog.docs.documents`), not via `SHOW TABLES` heuristics, so it matches Unity Catalog naming correctly.

## HTTP (gateway)

Base: `/v1/authoring/discovery`

| Method | Path | Role | Description |
|--------|------|------|-------------|
| `POST` | `/docs/propose` | editor | Profile docs tables → deterministic proposal (`201`) |
| `POST` | `/docs/propose-ai` | editor | Same + LLM refinement from row/text samples (`201`, needs `AI_GATEWAY_API_KEY`) |
| `GET` | `/runs` | viewer | Recent runs (summary) |
| `GET` | `/runs/:runId` | viewer | Full discovery + proposal |
| `POST` | `/runs/:runId/review` | editor | Review answers; optional merge (`apply: true` + `If-Match`) |

### Propose body (optional JSON)

```json
{
  "reviewConfidenceThreshold": 0.85,
  "tables": ["documents", "document_entities"],
  "requireNonEmptyTables": true
}
```

Empty body `{}` is valid.

**Responses**

- `422` `docs_schema_empty` — no requested tables in warehouse.
- `422` `docs_tables_empty` — tables exist but all have zero rows (run `docs_refresh` after upload).
- `502` `warehouse_unavailable` — Databricks SQL error.

Success `201` includes `missingTables`, `emptyTables`, `proposal.questions`.

### Review

- With `"apply": true`: **`If-Match` draft revision is mandatory** (same as `/ontology/draft/commands`).
- `requireCompleteReview` defaults to **true** when applying — every `proposal.questions` entry needs an answer (use `"decision": "yes"` / `"no"` / `"rename"` + `newName`).
- `409` `already_applied` unless `"allowReapply": true`.
- Preview without merge: omit `apply` or `"apply": false`.

## CLI

```bash
export BACKED_CONTROL_PLANE_URL=https://…
export CONTROL_PLANE_INTERNAL_TOKEN=…

backed ontology discover-docs gerace
backed ontology discover-docs-ai gerace --locale=it
backed ontology discover-docs gerace --json
backed ontology discovery-review gerace <runId> --yes-all --apply
```

## Default tables

`documents`, `document_pages`, `document_elements`, `document_entities`, `entity_profiles`.

## AI extraction env (control-plane)

| Variable | Purpose |
|----------|---------|
| `AI_GATEWAY_API_KEY` | Required for `/docs/propose-ai` |
| `ONTOLOGY_EXTRACT_MODEL` | Optional; defaults to `SEMANTIC_CHAT_MODEL` / `openai/gpt-4o-mini` |

Propose body may include `"locale": "it"` so property/object labels match the corpus language.

## E2E test (local)

From `anchor/packages/ontology-extract`, with Databricks env (e.g. `ontology/gerace/.env`) and `anchor/.env` (`AI_GATEWAY_API_KEY`):

```bash
ONTOLOGY_EXTRACT_E2E=1 pnpm --filter @trybacked/ontology-extract test
```

Skips automatically when `{catalog}.docs.*` has no rows (run `docs_refresh` after PDF upload for a full pass).

## Publish

Discovery only updates the **draft**. Publish: `POST /v1/authoring/ontology/publish`.
