# Variabili d’ambiente — cosa serve e dove

Due profili: **locale (Compose)** e **Railway (cloud)**. Stesso stack, meno file YAML in cloud.

## Profili

| Profilo     | Registry tenant                                | Login operatori                         | File da copiare                                                         |
| ----------- | ---------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| **Locale**  | `BACKED_REGISTRY_SOURCE=file` + `tenants.yaml` | `GATEWAY_AUTH_MODE=file` + `users.yaml` | `env/local.compose.env`                                                 |
| **Railway** | `BACKED_REGISTRY_SOURCE=http` → control-plane  | `GATEWAY_AUTH_MODE=workos`              | `env/railway.secrets.env` (solo segreti) + variabili per servizio sotto |

## Matrice per servizio

Legenda: **R** = obbligatorio, **O** = opzionale, **—** = non usato.

### Gateway (pubblico — MCP / login)

| Variabile                      | R/O                | Locale | Railway | Note                                                                                     |
| ------------------------------ | ------------------ | ------ | ------- | ---------------------------------------------------------------------------------------- |
| `GATEWAY_SESSION_SECRET`       | R                  | ✓      | ✓       | `openssl rand -hex 32` — cookie sessione gateway (non WorkOS)                            |
| `GATEWAY_PLATFORM_UPSTREAM`    | R                  | ✓      | ✓       | Locale: `http://platform-api:8787`. Railway: `http://platform-api.railway.internal:8787` |
| `GATEWAY_PLATFORM_TOKEN`       | R                  | ✓      | ✓       | **Deve coincidere con** `ANCHOR_API_TOKEN`                                               |
| `GATEWAY_COOKIE_SECURE`        | O                  | ✓      | ✓       | `1` in produzione                                                                        |
| `GATEWAY_AUTH_MODE`            | R                  | ✓      | ✓       | `file` (locale) o `workos` (Railway)                                                     |
| `GATEWAY_USERS_FILE`           | R se file          | ✓      | —       | Solo auth file                                                                           |
| `GATEWAY_TENANTS_REGISTRY`     | R se file registry | ✓      | —       | Mount `tenants.yaml`                                                                     |
| `BACKED_REGISTRY_SOURCE`       | R                  | ✓      | ✓       | `file` o `http`                                                                          |
| `BACKED_REGISTRY_URL`          | R se http          | ✓      | ✓       | Es. `http://control-plane:8791/v1/registry`                                              |
| `BACKED_REGISTRY_TOKEN`        | R se http          | ✓      | ✓       | = `CONTROL_PLANE_INTERNAL_TOKEN`                                                         |
| `BACKED_CONTROL_PLANE_URL`     | R se workos        | —      | ✓       | Base URL control-plane (senza path)                                                      |
| `CONTROL_PLANE_INTERNAL_TOKEN` | R se workos        | ✓      | ✓       | Gateway → `POST /v1/me/tenants`                                                          |
| `WORKOS_API_KEY`               | R se workos        | O      | ✓       | Dashboard WorkOS (`sk_live_…` / `sk_test_…`)                                             |
| `WORKOS_CLIENT_ID`             | R se workos        | O      | ✓       | `client_…`                                                                               |
| `WORKOS_REDIRECT_URI`          | R se workos        | O      | ✓       | **Deve essere** `{URL gateway}/callback` (non `/auth/callback` Carta)                    |
| `WORKOS_COOKIE_PASSWORD`       | —                  | —      | —       | **Solo** app Next.js AuthKit (console); il gateway **non** lo usa                        |
| `WORKOS_CONSOLE_REDIRECT_URI`  | —                  | —      | —       | Solo console Next.js                                                                     |
| `BACKED_DATABRICKS_*`          | —                  | —      | —       | **Non** sul gateway                                                                      |

### Platform-api (interno)

| Variabile                                       | R/O       | Locale | Railway |
| ----------------------------------------------- | --------- | ------ | ------- |
| `ANCHOR_API_TOKEN`                              | R         | ✓      | ✓       |
| `BACKED_REGISTRY_SOURCE`                        | R         | ✓      | ✓       |
| `BACKED_REGISTRY_URL` / `BACKED_REGISTRY_TOKEN` | R se http | ✓      | ✓       |
| `BACKED_DATABRICKS_HOST`                        | R         | ✓      | ✓       | SP piattaforma (bootstrap) |
| `BACKED_DATABRICKS_TOKEN`                       | R         | ✓      | ✓       |
| `BACKED_DATABRICKS_WAREHOUSE_ID`                | R         | ✓      | ✓       |
| `AI_GATEWAY_API_KEY`                            | O         | ✓      | ✓       | Solo `/v1/chat/ask`        |
| `ANCHOR_TENANTS_REGISTRY`                       | R se file | ✓      | —       |
| `DATABASE_URL`                                  | —         | —      | —       | Non usato (auth via token) |

### Control-plane + provisioner (worker)

| Variabile                          | R/O | Locale | Railway |
| ---------------------------------- | --- | ------ | ------- |
| `DATABASE_URL`                     | R   | ✓      | ✓       | Postgres — Railway: `${{Postgres.DATABASE_URL}}` |
| `CONTROL_PLANE_ADMIN_TOKEN`        | R   | ✓      | ✓       | CLI / `backed tenant create --remote`            |
| `CONTROL_PLANE_INTERNAL_TOKEN`     | R   | ✓      | ✓       | Registry HTTP + gateway WorkOS                   |
| `BACKED_DATABRICKS_HOST`           | R   | ✓      | ✓       |
| `BACKED_DATABRICKS_TOKEN`          | R   | ✓      | ✓       |
| `BACKED_DATABRICKS_WAREHOUSE_ID`   | R   | ✓      | ✓       |
| `BACKED_PLATFORM_PRINCIPAL`        | O   | ✓      | ✓       |
| `CONTROL_PLANE_SHARED_SPACES_JSON` | O   | ✓      | ✓       | Default ANAC condiviso                           |

Provisioner = stessa immagine del control-plane, comando `node dist/worker.js` (nessuna porta HTTP).

### Postgres (Railway template)

Solo `DATABASE_URL` esportata — nessuna config Backed sul servizio Postgres.

## WorkOS (allineato a `outdated/`)

Riferimento Carta/API legacy:

- `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`
- Redirect AuthKit legacy API: `/auth/callback` — **gateway anchor**: `/callback`
- `WORKOS_COOKIE_PASSWORD` (≥32 char) — **solo** console/web AuthKit, vedi `outdated/carta/docs/workos-setup.md`

In WorkOS Dashboard, per produzione gateway:

1. Redirect URI: `https://api.backed.app/callback` (o dominio Railway del servizio gateway)
2. Sign-in URL: URL pubblico del gateway (es. `https://api.backed.app/login` se esposto)

## Generazione segreti

```bash
openssl rand -hex 32   # GATEWAY_SESSION_SECRET
openssl rand -hex 24   # ANCHOR_API_TOKEN, CONTROL_PLANE_* (≥16 char)
```

Regola unica: `GATEWAY_PLATFORM_TOKEN` = `ANCHOR_API_TOKEN`.

## Bootstrap Databricks

Una tantum in locale:

```bash
backed platform bootstrap
```

Copia `BACKED_DATABRICKS_*` (e opz. `BACKED_PLATFORM_PRINCIPAL`) su **control-plane**, **provisioner** e **platform-api** in Railway.
