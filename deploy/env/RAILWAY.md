# Railway — progetto `backed` (Versadia)

Repo sorgente: **[trybacked/anchor](https://github.com/trybacked/anchor)** (root = cartella `anchor/`).

## Mapping servizi (nomi legacy → ruolo)

| Servizio Railway      | Ruolo anchor           | Dominio / rete                                                              |
| --------------------- | ---------------------- | --------------------------------------------------------------------------- |
| **api**               | Gateway (MCP + WorkOS) | `api.backed.app` (pubblico)                                                 |
| **cloud**             | Control-plane API      | `cloud.backed.app` (opzionale; anche `control-plane.railway.internal:8791`) |
| **platform-api**      | Platform API           | Solo privato `platform-api.railway.internal:8787`                           |
| **provisioner**       | Worker provisioning    | Nessuna HTTP                                                                |
| **Postgres**          | DB control-plane       | `${{Postgres.DATABASE_URL}}`                                                |
| **console** / **web** | App legacy             | Non toccati da questo stack                                                 |

Config build: imposta **`RAILWAY_DOCKERFILE_PATH`** per servizio (es. `apps/gateway/Dockerfile`) — Railway altrimenti usa Railpack sul monorepo. Opzionale: `apps/*/railway.toml` con `builder = "DOCKERFILE"`.

## Checklist post-deploy

1. Imposta **BACKED_DATABRICKS_HOST**, **TOKEN**, **WAREHOUSE_ID** su `cloud`, `provisioner`, `platform-api` (output di `backed platform bootstrap`).
2. WorkOS Dashboard: redirect **`https://api.backed.app/callback`** (path gateway, non `/auth/callback`).
3. CLI remota:
   ```bash
   export BACKED_CONTROL_PLANE_URL=https://cloud.backed.app
   export CONTROL_PLANE_ADMIN_TOKEN=…
   backed tenant create gerace --remote
   ```
4. Rinomina i servizi in dashboard (api → gateway, cloud → control-plane) quando vuoi — i nomi DNS privati usano `privateNetworkEndpoint` (`gateway`, `control-plane`, …).

Dettaglio variabili: [ENV.md](./ENV.md).
