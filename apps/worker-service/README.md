# @backed/worker-service

Multi-tenant HTTP API that runs the Anchor pipeline as a hosted service. Partners submit a corpus, the service ingests, profiles, and proposes a semantic model, then deletes the raw bytes and keeps only derived artifacts.

## Tenant layout

Each tenant workspace is split into ephemeral processing and durable persistence under `WORKER_SERVICE_DATA_ROOT`:

```
tenants/<tenantId>/
├── work/      ← uploaded bytes + pipeline scratch (GC'd every run)
└── persist/   ← model.yaml, ledger.json, deletion-log.jsonl, proposal.json,
                 review.json, vocabulary.json, documents.json, profile.json
```

Documents and raw corpus **never** persist. Re-submitting unchanged files costs nothing: content hashes in `ledger.json` skip them. Every deletion is recorded in an append-only `deletion-log.jsonl`.

The data root is runtime state and is not tracked in git. Tests allocate their own temp directories.

## API surface

All tenant routes are namespaced `/v1/tenants/{tenantId}` and require partner authentication. The contract lives in [`openapi.yaml`](./openapi.yaml) and is the source of truth for the [`@trybacked/anchor`](../../packages/anchor) SDK.

| Method  | Path              | Purpose                                  |
| ------- | ----------------- | ---------------------------------------- |
| `POST`  | `runs`            | Submit a corpus and start a pipeline run |
| `GET`   | `runs/{runId}`    | Run status and result                    |
| `GET`   | `model`           | Current `model.yaml` for the tenant      |
| `GET`   | `review`          | Open review questions                    |
| `POST`  | `review`          | Submit review answers                    |
| `GET`   | `config`          | Tenant pipeline configuration            |
| `PATCH` | `config`          | Update tenant pipeline configuration     |
| `GET`   | `audit/deletions` | Append-only deletion log                 |
| `GET`   | `audit/ledger`    | Content-hash ledger                      |

`GET /health` is unauthenticated and returns `{ ok, service, version, dataRootWritable }`. `ok` is false with HTTP 503 when the volume is missing or read-only.

## Configuration

Copy [`.env.example`](./.env.example). Every variable is resolved in [`src/config.ts`](./src/config.ts); startup fails fast on an invalid or missing auth configuration.

Authentication requires exactly one of:

- **Control plane** (production): `CONTROL_PLANE_URL` + `WORKER_INTERNAL_SECRET`, with partner tokens stored in Postgres.
- **Static token / inline registry** (local dev): `WORKER_SERVICE_AUTH_TOKEN` and/or `WORKER_SERVICE_PARTNERS_JSON`.

`AI_GATEWAY_API_KEY` is required for the semantic proposal stage.

## Running locally

```bash
export WORKER_SERVICE_AUTH_TOKEN=dev-token
export AI_GATEWAY_API_KEY=...
pnpm --filter @backed/worker-service start
```

## Docker / Railway

Build from the repository root:

```bash
docker build -f apps/worker-service/Dockerfile -t backed-worker-service .
docker run --rm -p 8790:8790 \
  -e WORKER_SERVICE_AUTH_TOKEN=dev-token \
  -e AI_GATEWAY_API_KEY="$AI_GATEWAY_API_KEY" \
  -v backed-worker-data:/data \
  backed-worker-service
```

Use `--build-arg IMAGE_VARIANT=full` for the PDF rendering / OCR path (`poppler-utils`).

On Railway, point at [`railway.toml`](./railway.toml) and **mount a persistent volume at `/data`**. The platform-injected `PORT` takes precedence over `WORKER_SERVICE_PORT`.

Post-deploy smoke test:

```bash
export WORKER_SERVICE_URL=https://your-service.example
export WORKER_SERVICE_AUTH_TOKEN=...
apps/worker-service/scripts/smoke.sh
```

## Observability

Structured JSON lines on stdout: `run.started`, `gc.completed`, `run.completed`, `run.failed`, each carrying `tenantId`, `runId`, `partnerId`, `durationMs`, `filesDeleted`, and `skipped`.

Alerting hints: failed run rate spikes, `gc.completed` with `bytesDeleted: 0` on runs that uploaded files, `dataRootWritable: false`, and disk usage on the `/data` volume.
