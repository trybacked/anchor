# Backed gateway

User-facing HTTP entry for the future workshop: authenticates operators, routes to per-tenant Anchor API servers, and injects upstream bearer tokens (never exposed to the browser).

## Modes

| Mode          | Flag                                   | Routes                                        |
| ------------- | -------------------------------------- | --------------------------------------------- |
| Multi-comune  | `WORKSHOP_MULTI_TENANT=true` (default) | `POST /login`, `ALL /t/{tenantId}/v1/*`       |
| Single client | `WORKSHOP_MULTI_TENANT=false`          | `POST /login`, `ALL /v1/*` → default upstream |

## Quick start (dev)

1. Set `ANCHOR_API_TOKEN` per tenant in `~/.config/backed/{tenant}.env` and run two API servers:

```bash
ANCHOR_API_PORT=8797 ANCHOR_WORKSPACE_ROOT=../ontology/gerace scripts/anchor-api.launcher.sh gerace
ANCHOR_API_PORT=8798 ANCHOR_WORKSPACE_ROOT=../ontology/backed scripts/anchor-api.launcher.sh backed
```

2. Create `apps/gateway/users.yaml` from [`users.example.yaml`](./users.example.yaml) and hash a password:

```bash
pnpm --filter @backed/gateway hash-password 'your-password'
```

3. Export gateway env (from repo root):

```bash
export GATEWAY_SESSION_SECRET="$(openssl rand -hex 32)"
export GATEWAY_TENANTS_REGISTRY="$(pwd)/tenants.yaml"
export GATEWAY_USERS_FILE="$(pwd)/anchor/apps/gateway/users.yaml"
export GATEWAY_UPSTREAMS="gerace=http://127.0.0.1:8797,backed=http://127.0.0.1:8798"
export GATEWAY_TENANT_TOKEN_GERACE="<same as gerace ANCHOR_API_TOKEN>"
export GATEWAY_TENANT_TOKEN_BACKED="<same as backed ANCHOR_API_TOKEN>"
pnpm --filter @backed/gateway build && pnpm --filter @backed/gateway start
```

4. Login and query:

```bash
curl -c /tmp/jar -X POST http://127.0.0.1:8790/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"your-password"}'
curl -b /tmp/jar http://127.0.0.1:8790/t/gerace/v1/model/entities
```

Single-client mode: set `WORKSHOP_MULTI_TENANT=false`, `GATEWAY_DEFAULT_UPSTREAM`, and `GATEWAY_DEFAULT_UPSTREAM_TOKEN` instead of `GATEWAY_UPSTREAMS`.

## Security notes

- Only the gateway should be exposed publicly; api-server processes stay on a private network.
- Upstream tokens live in gateway env (`GATEWAY_TENANT_TOKEN_*`), not in `tenants.yaml`.
- Sessions use httpOnly cookies; set `GATEWAY_COOKIE_SECURE=1` behind HTTPS.
