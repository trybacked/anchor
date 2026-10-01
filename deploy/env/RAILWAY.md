# Railway — progetto `backed` (Versadia)

Repo sorgente: **[trybacked/anchor](https://github.com/trybacked/anchor)** (root = cartella `anchor/`).

## Mapping servizi (nomi legacy → ruolo)

| Servizio Railway | Ruolo anchor           | Dominio / rete                                                              |
| ---------------- | ---------------------- | --------------------------------------------------------------------------- |
| **api**          | Gateway (MCP + WorkOS) | `api.backed.app` (pubblico)                                                 |
| **cloud**        | Control-plane API      | `cloud.backed.app` (opzionale; anche `control-plane.railway.internal:8791`) |
| **platform-api** | Platform API           | Solo privato `platform-api.railway.internal:8787`                           |
| **provisioner**  | Worker provisioning    | Nessuna HTTP — **disabilita health check HTTP** (vedi sotto)                |
| **Postgres**     | DB control-plane       | `${{Postgres.DATABASE_URL}}`                                                |

**Altro nel progetto (non stack anchor):** **web** → `www.backed.app` (Next.js / Stripe / WorkOS, repo non collegato in dashboard). **console** (`trybacked/console`, `console.backed.app`) è stato rimosso: era la UI del vecchio api/cloud.

Config build: imposta **`RAILWAY_DOCKERFILE_PATH`** per servizio (es. `apps/gateway/Dockerfile`) — Railway altrimenti usa Railpack sul monorepo. Opzionale: `apps/*/railway.toml` con `builder = "DOCKERFILE"`.

## Checklist post-deploy

1. Imposta **BACKED_DATABRICKS_HOST**, **TOKEN**, **WAREHOUSE_ID** su `cloud`, `provisioner`, `platform-api` (output di `backed platform bootstrap`).
2. WorkOS Dashboard → app AuthKit **「backed」** (`WORKOS_CLIENT_ID` sul servizio **api**): redirect **`https://api.backed.app/callback`** (path gateway Hono, **non** `/auth/callback` Carta). Se manca, AuthKit mostra _Couldn't sign in_.
3. CLI remota:
   ```bash
   export BACKED_CONTROL_PLANE_URL=https://cloud.backed.app
   export CONTROL_PLANE_ADMIN_TOKEN=…
   backed tenant create gerace --remote
   ```
4. Rinomina i servizi in dashboard (api → gateway, cloud → control-plane) quando vuoi — i nomi DNS privati usano `privateNetworkEndpoint` (`gateway`, `control-plane`, …).

### Job provisioning bloccato in `pending`

Il worker è **`node dist/worker.js`** (servizio **provisioner**). Se Railway applica `healthcheckPath=/health/live` (come su **cloud**), il container muore perché il worker **non espone HTTP** — nei log vedi solo `Control plane schema applied.` e poi `Stopping Container`, mai `Control plane worker started`.

**Fix:** redeploy **provisioner** da branch `staging` (worker espone `GET /health/live` su `PORT` prima della migrate). Start command consigliato: `node dist/worker.js` (vedi `deploy/railway.provisioner.toml`). Nei log devono comparire **entrambe** le righe:

- `Provisioner health http://…/health/live`
- `Control plane worker started`

Poi controlla il job:

```bash
curl -sS -H "Authorization: Bearer $CONTROL_PLANE_ADMIN_TOKEN" \
  "https://cloud.backed.app/v1/jobs/<JOB_ID>"
```

Stati: `pending` → `running` → `completed` (o `failed` con messaggio in `error`). Il job resta in coda: non serve ricreare l’organization.

Dettaglio variabili: [ENV.md](./ENV.md).
