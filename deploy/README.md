# Deploy — Backed platform stack (Docker Compose)

**Gateway + platform-api + control plane (optional HTTP registry).** Only the gateway is exposed on the host by default.

## Layout

```text
anchor/deploy/
├── docker-compose.yml    → gateway, platform-api, postgres, control-plane, provisioner
├── env/
│   ├── ENV.md                      → required vs optional vars (matrix)
│   ├── local.compose.env.example   → local profile
│   └── railway.*.env.example       → Railway profile
├── users.yaml.example    → file auth (GATEWAY_AUTH_MODE=file)
└── scripts/
    ├── check-stack.mjs
    └── smoke-stack.sh
```

## Modes

| Mode                   | Registry                                                     | Operators                          |
| ---------------------- | ------------------------------------------------------------ | ---------------------------------- |
| **Local (default)**    | `BACKED_REGISTRY_SOURCE=file` + repo `tenants.yaml`          | `users.yaml`                       |
| **Cloud-like compose** | `BACKED_REGISTRY_SOURCE=http` → control-plane `/v1/registry` | `GATEWAY_AUTH_MODE=workos` or file |

See [docs/PLATFORM.md](../../docs/PLATFORM.md).

## First-time setup (file registry)

```bash
cd anchor/deploy
cp env/local.compose.env.example .env
cp users.yaml.example users.yaml

backed platform bootstrap
# Set ANCHOR_API_TOKEN = GATEWAY_PLATFORM_TOKEN. Documents use S3 backed-v1.

pnpm --filter @trybacked/gateway hash-password 'your-password'
chmod 600 .env users.yaml
```

## First-time setup (HTTP registry + control plane)

See [env/ENV.md](./env/ENV.md) and `env/local.compose.env.example` (commented http + WorkOS section).

Create organizations via API/CLI (no manual `tenants.yaml` edit):

```bash
export BACKED_CONTROL_PLANE_URL=http://127.0.0.1:8791
export CONTROL_PLANE_ADMIN_TOKEN=...
backed tenant create gerace --remote
```

## Run

From **anchor/**:

```bash
pnpm deploy:check
docker compose -f deploy/docker-compose.yml up -d --build
```

Public URL: `http://127.0.0.1:${GATEWAY_PUBLIC_PORT:-8080}`.

## Commands

| Action            | Command                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| Preflight         | `pnpm deploy:check`                                                                                  |
| GitHub CI (local) | `pnpm check:ci`                                                                                      |
| Start             | `docker compose -f deploy/docker-compose.yml up -d --build`                                          |
| Logs              | `docker compose -f deploy/docker-compose.yml logs -f gateway platform-api control-plane provisioner` |
| Stop              | `docker compose -f deploy/docker-compose.yml down`                                                   |

## Token rule

`GATEWAY_PLATFORM_TOKEN` **must equal** `ANCHOR_API_TOKEN`.
