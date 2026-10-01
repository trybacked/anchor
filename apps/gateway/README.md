# Backed gateway

User-facing HTTP entry: authenticates operators, enforces tenant RBAC from `users.yaml`, and proxies to the **platform api-server** with `Authorization`, `X-Backed-User`, and `X-Backed-Tenant`.

## Routes

| Route                    | Behavior                                      |
| ------------------------ | --------------------------------------------- |
| `POST /login`            | Session cookie                                |
| `ALL /t/{tenantId}/v1/*` | Proxy to platform upstream                    |
| `ALL /v1/*`              | Optional when `GATEWAY_DEFAULT_TENANT` is set |

## Docker (platform stack)

See [deploy/README.md](../../deploy/README.md) and `deploy/docker-compose.yml`.

## Quick start (dev)

1. Run platform api-server (no `ANCHOR_WORKSPACE_ROOT`):

```bash
export ANCHOR_API_TOKEN=dev-secret
export ANCHOR_TENANTS_REGISTRY="$(pwd)/tenants.yaml"
export BACKED_DATABRICKS_HOST=...
export BACKED_DATABRICKS_TOKEN=...
export BACKED_DATABRICKS_WAREHOUSE_ID=...
pnpm --filter @trybacked/api-server start
```

2. Create `users.yaml` from [`users.example.yaml`](./users.example.yaml) and hash a password:

```bash
pnpm --filter @trybacked/gateway hash-password 'your-password'
```

3. Gateway env:

```bash
export GATEWAY_SESSION_SECRET="$(openssl rand -hex 32)"
export GATEWAY_TENANTS_REGISTRY="$(pwd)/tenants.yaml"
export GATEWAY_USERS_FILE="$(pwd)/anchor/apps/gateway/users.yaml"
export GATEWAY_PLATFORM_UPSTREAM="http://127.0.0.1:8787"
export GATEWAY_PLATFORM_TOKEN="<same as ANCHOR_API_TOKEN>"
pnpm --filter @trybacked/gateway build && pnpm --filter @trybacked/gateway start
```

4. Login and query:

```bash
curl -c /tmp/jar -X POST http://127.0.0.1:8790/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"your-password"}'
curl -b /tmp/jar http://127.0.0.1:8790/t/gerace/v1/model/entities
```

## Security notes

- Only the gateway should be exposed publicly; platform-api stays on a private network.
- Platform token lives in gateway env (`GATEWAY_PLATFORM_TOKEN`), not in `tenants.yaml`.
- Sessions use httpOnly cookies; set `GATEWAY_COOKIE_SECURE=1` behind HTTPS.
