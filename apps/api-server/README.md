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

### Semantic chat (Vercel AI SDK)

`POST /v1/chat/ask` uses the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) via `@trybacked/semantic-chat/adapters/vercel-ai`:

- **`AI_GATEWAY_API_KEY`** — single key for OpenAI, Anthropic, etc. through Gateway
- **`SEMANTIC_CHAT_MODEL`** or **`SEMANTIC_MODEL`** — optional, default `openai/gpt-4o-mini`

Smoke test (real LLM + warehouse): from repo root after `pnpm build`, run `pnpm smoke:semantic-nl` (see `scripts/semantic-nl-smoke.cases.json`).

Generate a committed spec after build:

```bash
pnpm --filter @trybacked/api-server build
pnpm --filter @trybacked/api-server generate:openapi
```
