# Environment variables — what you need and where

Two profiles: **local (Compose)** and **Railway (cloud)**. Same stack; fewer YAML files in the cloud.

## Profiles

| Profile     | Tenant registry                                | Operator login                          | Files to copy                                                     |
| ----------- | ---------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------- |
| **Local**   | `BACKED_REGISTRY_SOURCE=file` + `tenants.yaml` | `GATEWAY_AUTH_MODE=file` + `users.yaml` | `env/local.compose.env`                                           |
| **Railway** | `BACKED_REGISTRY_SOURCE=http` → control-plane  | `GATEWAY_AUTH_MODE=workos`              | `env/railway.secrets.env` (secrets only) + per-service vars below |

## Per-service matrix

Legend: **R** = required, **O** = optional, **—** = not used.

### Gateway (public — MCP / login / API docs)

Interactive docs (Scalar): **`GET /docs`**, **`GET /docs/platform`** (platform browse, always available, no tenant prefix), and **`GET /docs/t/{tenantId}`** are **public**. If the registry has no published tenants yet, **`/docs`** redirects to **`/docs/platform`**; with multiple tenants it shows a picker. **`/docs/t/reference`** redirects to **`/docs/platform`** (compatibility). OpenAPI: **`GET /openapi.json`** (platform browse) or **`GET /t/{tenantId}/openapi.json`**. Calls to **`/t/{tenantId}/v1/...`** require login.

**Health:** on the gateway use **`GET /health`** and **`GET /health/live`** (no tenant prefix). The OpenAPI document adapted for Scalar **does not** include `/health*` under `/t/{tenant}`: there the proxy requires a session even if platform-api exposes them as public.

| Variable                       | R/O                | Local | Railway | Notes                                                                                                                                                                                    |
| ------------------------------ | ------------------ | ----- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GATEWAY_SESSION_SECRET`       | R                  | ✓     | ✓       | `openssl rand -hex 32` — gateway session cookie (not WorkOS)                                                                                                                             |
| `GATEWAY_PLATFORM_UPSTREAM`    | R                  | ✓     | ✓       | Local: `http://platform-api:8787`. Railway: `http://platform-api.railway.internal:8080` (use `${{platform-api.PORT}}`, not 8787)                                                         |
| `GATEWAY_PLATFORM_TOKEN`       | R                  | ✓     | ✓       | **Must match** `ANCHOR_API_TOKEN`                                                                                                                                                        |
| `GATEWAY_COOKIE_SECURE`        | O                  | ✓     | ✓       | `1` in production                                                                                                                                                                        |
| `GATEWAY_PUBLIC_ORIGIN`        | O                  | —     | ✓       | e.g. `https://api.backed.app` — HTTPS URL in Scalar (avoids mixed content). If missing with secure cookies, derived from `WORKOS_REDIRECT_URI`; required when secure and neither is set. |
| `GATEWAY_AUTH_MODE`            | R                  | ✓     | ✓       | `file` (local) or `workos` (Railway)                                                                                                                                                     |
| `GATEWAY_USERS_FILE`           | R if file          | ✓     | —       | File auth only                                                                                                                                                                           |
| `GATEWAY_TENANTS_REGISTRY`     | R if file registry | ✓     | —       | Mount `tenants.yaml`                                                                                                                                                                     |
| `BACKED_REGISTRY_SOURCE`       | R                  | ✓     | ✓       | `file` or `http`                                                                                                                                                                         |
| `BACKED_REGISTRY_URL`          | R if http          | ✓     | ✓       | e.g. `http://control-plane:8791/v1/registry`                                                                                                                                             |
| `BACKED_REGISTRY_TOKEN`        | R if http          | ✓     | ✓       | = `CONTROL_PLANE_INTERNAL_TOKEN`                                                                                                                                                         |
| `BACKED_CONTROL_PLANE_URL`     | R if workos        | O*    | ✓       | Control-plane base URL (no path). **Also required** for `/t/{tenant}/v1/authoring/*` proxy (Chiedi Model Studio). Local Compose: set if you use authoring API.                           |
| `CONTROL_PLANE_INTERNAL_TOKEN` | R if workos        | ✓     | ✓       | Gateway → WorkOS tenant resolve **and** authoring proxy (`Authorization` + `X-Backed-User`)                                                                                              |
| `WORKOS_API_KEY`               | R if workos        | O     | ✓       | WorkOS Dashboard (`sk_live_…` / `sk_test_…`)                                                                                                                                             |
| `WORKOS_CLIENT_ID`             | R if workos        | O     | ✓       | `client_…`                                                                                                                                                                               |
| `WORKOS_REDIRECT_URI`          | R if workos        | O     | ✓       | **Must be** `{gateway URL}/callback` (not Carta `/auth/callback`)                                                                                                                        |
| `WORKOS_COOKIE_PASSWORD`       | —                  | —     | —       | **Next.js AuthKit only** (console); gateway **does not** use it                                                                                                                          |
| `WORKOS_CONSOLE_REDIRECT_URI`  | —                  | —     | —       | Next.js console only                                                                                                                                                                     |
| `BACKED_S3_BUCKET`             | O                  | ✓     | ✓       | Document archive. Default `backed-v1` (`eu-north-1`)                                                                                                                                     |

Third-party apps (Chiedi, partner SPAs): register OAuth clients on the control plane (`POST /v1/admin/oauth-clients`); gateway reads them via `GET /v1/oauth-clients` using `CONTROL_PLANE_INTERNAL_TOKEN`. See [OAUTH_APPS.md](./OAUTH_APPS.md).

### Platform-api (internal)

| Variable                                        | R/O       | Local | Railway |
| ----------------------------------------------- | --------- | ----- | ------- |
| `ANCHOR_API_TOKEN`                              | R         | ✓     | ✓       |
| `BACKED_REGISTRY_SOURCE`                        | R         | ✓     | ✓       |
| `BACKED_REGISTRY_URL` / `BACKED_REGISTRY_TOKEN` | R if http | ✓     | ✓       |
| `BACKED_ENGINE`                                 | O         | ✓     | ✓       | `files` (only engine today)                 |
| `BACKED_FILES_ROOT`                             | O         | ✓     | ✓       | Document folder per tenant / workspace      |
| `BACKED_FILES_REGISTRY_ROOT`                    | O         | ✓     | ✓       | On-disk ontology registry for platform mode |
| `AI_GATEWAY_API_KEY`                            | O         | ✓     | ✓       | `/v1/chat/ask` (semantic agent)             |
| `ANCHOR_TENANTS_REGISTRY`                       | R if file | ✓     | —       |
| `DATABASE_URL`                                  | —         | —     | —       | Not used (token auth)                       |

### Control-plane + provisioner (worker)

| Variable                           | R/O | Local | Railway |
| ---------------------------------- | --- | ----- | ------- |
| `DATABASE_URL`                     | R   | ✓     | ✓       | Postgres — Railway: `${{Postgres.DATABASE_URL}}`                                                                                                        |
| `CONTROL_PLANE_ADMIN_TOKEN`        | R   | ✓     | ✓       | CLI / `backed tenant create --remote`                                                                                                                   |
| `CONTROL_PLANE_INTERNAL_TOKEN`     | R   | ✓     | ✓       | HTTP registry + gateway WorkOS                                                                                                                          |
| `BACKED_FILES_ROOT`                | R   | ✓     | ✓       | Tenant document trees                                                                                                                                   |
| `BACKED_FILES_REGISTRY_ROOT`       | R   | ✓     | ✓       | Published ontology artifacts on disk                                                                                                                    |
| `CONTROL_PLANE_SHARED_SPACES_JSON` | O   | ✓     | ✓       | JSON map of shared UC spaces (default `{}`)                                                                                                             |
| `AI_GATEWAY_API_KEY`               | O   | ✓     | ✓       | Vercel AI Gateway — required for `POST …/discovery/docs/propose-ai` (ontology extract). Same key as platform-api `/v1/chat/ask` if you use one gateway. |
| `ONTOLOGY_EXTRACT_MODEL`           | O   | ✓     | ✓       | Optional model id for ontology extract (defaults in `@trybacked/ontology-extract`).                                                                     |

Provisioner = same image as control-plane, command `node dist/worker.js` (no HTTP port). Handles `create_tenant` (mkdir tenant under files root) and **`publish_ontology`** (writes filesystem registry, bumps `organizations.ontology_version`).

After deploy or schema changes: `pnpm migrate` in control-plane (applies `schema.sql`, including `ontology_*` tables).

Ontology authoring API reference: [docs/ONTOLOGY-AUTHORING.md](../../../docs/ONTOLOGY-AUTHORING.md).

### Postgres (Railway template)

Only `DATABASE_URL` is exported — no Backed config on the Postgres service.

## WorkOS (aligned with `outdated/`)

Legacy Carta/API reference:

- `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`
- Legacy AuthKit redirect: `/auth/callback` — **anchor gateway**: `/callback`
- `WORKOS_COOKIE_PASSWORD` (≥32 char) — **console/web AuthKit only**, see `outdated/carta/docs/workos-setup.md`

In WorkOS Dashboard, for production gateway:

1. Redirect URI: `https://api.backed.app/callback` (or your Railway gateway domain)
2. Sign-in URL: public gateway URL (e.g. `https://api.backed.app/login` if exposed)

## Generating secrets

```bash
openssl rand -hex 32   # GATEWAY_SESSION_SECRET
openssl rand -hex 24   # ANCHOR_API_TOKEN, CONTROL_PLANE_* (≥16 char)
```

Single rule: `GATEWAY_PLATFORM_TOKEN` = `ANCHOR_API_TOKEN`.

## File sources (read-only)

Anchor does not ingest files. Place documents under `BACKED_FILES_ROOT/{tenantId}/…` (or workspace `sources/`). Discovery and pull read that tree; publish writes ontology artifacts under `BACKED_FILES_REGISTRY_ROOT`.

## Platform bootstrap

One-time locally:

```bash
backed platform bootstrap
```

Copy `BACKED_FILES_*` to **control-plane**, **provisioner**, and **platform-api** on Railway.
