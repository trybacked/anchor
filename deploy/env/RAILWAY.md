# Railway — `backed` project (Versadia)

Source repo: **[trybacked/anchor](https://github.com/trybacked/anchor)** (root = `anchor/` folder).

## Service mapping (legacy names → role)

| Railway service  | Anchor role            | Domain / network                                                          |
| ---------------- | ---------------------- | ------------------------------------------------------------------------- |
| **api**          | Gateway (MCP + WorkOS) | `api.backed.app` (public)                                                 |
| **cloud**        | Control-plane API      | `cloud.backed.app` (optional; also `control-plane.railway.internal:8791`) |
| **platform-api** | Platform API           | Private only `platform-api.railway.internal:${PORT}` (Railway `PORT` is usually **8080**, not 8787) |
| **provisioner**  | Provisioning worker    | No HTTP — **disable HTTP health check** (see below)                       |
| **Postgres**     | Control-plane DB       | `${{Postgres.DATABASE_URL}}`                                              |

**Other project services (not anchor stack):** **web** → `www.backed.app` (Next.js / Stripe / WorkOS, repo not linked in dashboard). **console** (`trybacked/console`, `console.backed.app`) was removed: it was the legacy api/cloud UI.

Build config: set **`RAILWAY_DOCKERFILE_PATH`** per service (e.g. `apps/gateway/Dockerfile`) — otherwise Railway uses Railpack on the monorepo. Optional: `apps/*/railway.toml` with `builder = "DOCKERFILE"`.

## Post-deploy checklist

1. Set **BACKED_S3_BUCKET** `backed-v1` and **BACKED_S3_REGION** `eu-north-1` on `cloud`, `provisioner`, and `platform-api`.
2. WorkOS Dashboard → AuthKit app **「backed」** (`WORKOS_CLIENT_ID` on **api** service): redirect **`https://api.backed.app/callback`** (gateway Hono path, **not** Carta `/auth/callback`). If missing, AuthKit shows _Couldn't sign in_.
3. Remote CLI:
   ```bash
   export BACKED_CONTROL_PLANE_URL=https://cloud.backed.app
   export CONTROL_PLANE_ADMIN_TOKEN=…
   backed tenant create gerace --remote
   ```
4. Set **private network endpoints**: `cloud` → `control-plane`, `platform-api` → `platform-api`. Internal URLs use **`http://control-plane.railway.internal:8080`** and **`http://platform-api.railway.internal:8080`** (or `${{service.PORT}}` references).
5. **Gateway (`api`) env:** `GATEWAY_PLATFORM_UPSTREAM=http://platform-api.railway.internal:${{platform-api.PORT}}`, `BACKED_REGISTRY_URL=https://cloud.backed.app/v1/registry` (or internal control-plane URL), `GATEWAY_PLATFORM_TOKEN=${{platform-api.ANCHOR_API_TOKEN}}`, `BACKED_REGISTRY_TOKEN=${{cloud.CONTROL_PLANE_INTERNAL_TOKEN}}`.
6. **platform-api:** `BACKED_REGISTRY_URL=https://cloud.backed.app/v1/registry` until private DNS is stable; match `BACKED_REGISTRY_TOKEN` to control-plane. Avoid Railway **HTTP healthcheck on `/health/ready`** before commit `e161816` (health routes no longer require tenant context) — use `/health/live` only or disable healthcheck for first deploy of that fix.
7. Rename services in the dashboard (api → gateway, cloud → control-plane) when you want — private DNS names use `privateNetworkEndpoint`.

### Provisioning job stuck in `pending`

The worker is **`node dist/worker.js`** (**provisioner** service). If Railway applies `healthcheckPath=/health/live` (like **cloud**), the container exits because the worker **does not expose HTTP** — logs show only `Control plane schema applied.` then `Stopping Container`, never `Control plane worker started`.

**Fix:** redeploy **provisioner** from branch `staging` (worker exposes `GET /health/live` on `PORT` before migrate). Recommended start command: `node dist/worker.js` (see `deploy/railway.provisioner.toml`). Logs should include **both** lines:

- `Provisioner health http://…/health/live`
- `Control plane worker started`

Then check the job:

```bash
curl -sS -H "Authorization: Bearer $CONTROL_PLANE_ADMIN_TOKEN" \
  "https://cloud.backed.app/v1/jobs/<JOB_ID>"
```

States: `pending` → `running` → `completed` (or `failed` with message in `error`). The job stays queued: you do not need to recreate the organization.

Variable details: [ENV.md](./ENV.md).
