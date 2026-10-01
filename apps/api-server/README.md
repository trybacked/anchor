# Anchor API server

One HTTP service for product apps, workshops, and MCP bridges.

```bash
# Platform mode (multi-tenant — default when ANCHOR_WORKSPACE_ROOT is unset)
export ANCHOR_API_TOKEN=...
export ANCHOR_TENANTS_REGISTRY=/path/to/tenants.yaml
export BACKED_DATABRICKS_HOST=...
export BACKED_DATABRICKS_TOKEN=...
export BACKED_DATABRICKS_WAREHOUSE_ID=...
pnpm --filter @trybacked/api-server start

# Legacy single workspace (local MCP / dev)
export ANCHOR_WORKSPACE_ROOT=/path/to/ontology/gerace
export ANCHOR_API_PORT=8787
pnpm --filter @trybacked/api-server start
```

Platform requests require `Authorization: Bearer <ANCHOR_API_TOKEN>`, `X-Backed-Tenant`, and optional `X-Backed-User` (gateway only). Ontologies load from `/Volumes/<catalog>/backed/registry/current.json`.

See [docs/PLATFORM.md](../../../docs/PLATFORM.md).

- **OpenAPI:** `GET /openapi.json`
- **Health:** `GET /health/live` (liveness) · `GET /health` / `GET /health/ready` (capabilities)

### Production / Docker

Build from the **backed repo root** (parent of `anchor/`):

```bash
docker build -f anchor/apps/api-server/Dockerfile -t backed-anchor-api .
```

Compose (auto-restart, health check, persistent audit log volume):

```bash
export ANCHOR_API_ENV_FILE="$HOME/.config/backed/gerace.env"   # ANCHOR_API_TOKEN + Databricks
export ANCHOR_WORKSPACE_HOST="$(pwd)/ontology/gerace"
docker compose -f anchor/apps/api-server/docker-compose.yml up -d --build
curl -s "http://127.0.0.1:${ANCHOR_API_PORT:-8787}/health/live"
```

| Variable                   | Purpose                                                                       |
| -------------------------- | ----------------------------------------------------------------------------- |
| `HOST` / `ANCHOR_API_HOST` | Bind address (use `0.0.0.0` in containers)                                    |
| `PORT` / `ANCHOR_API_PORT` | HTTP port (default `8787`)                                                    |
| `ANCHOR_AUDIT_LOG_PATH`    | Append-only JSONL audit log (default in image: `/var/log/anchor/audit.jsonl`) |
| `ANCHOR_AUDIT_LOG_STDERR`  | Set `0` to disable mirroring audit lines to stderr                            |

Railway: see [`railway.toml`](./railway.toml) (`healthcheckPath=/health/live`, restart on failure).

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
