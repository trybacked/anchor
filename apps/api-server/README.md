# Anchor API server

One HTTP service for product apps, workshops, and MCP bridges.

```bash
# From an ontology workspace (model.yaml + optional .env for Databricks)
export ANCHOR_WORKSPACE_ROOT=/path/to/ontology/gerace
export ANCHOR_API_PORT=8787
pnpm --filter @trybacked/api-server build
pnpm --filter @trybacked/api-server start
```

- **OpenAPI:** `GET /openapi.json`
- **Health:** `GET /health`

### Object query limits

`POST /v1/query/objects` (and MCP `query_objects`) enforce a hard row cap:

- Default **15** rows when `limit` is omitted (`mode: rows`).
- Maximum **1000** rows per request (`limit` above 1000 is rejected at validation with HTTP **400**).
- Semantic chat applies a stricter cap (**50**) on LLM-generated plans before execution.

Use `mode: "count"` for totals; add filters or lower `limit` instead of raising the cap.

Generate a committed spec after build:

```bash
pnpm --filter @trybacked/api-server build
pnpm --filter @trybacked/api-server generate:openapi
```
