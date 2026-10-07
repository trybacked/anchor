# Ontology discovery (control-plane)

Discovery reads the tenant **file source** configured on control-plane (`BACKED_FILES_ROOT/{tenantId}`).

## Prerequisites

1. Control-plane Postgres (`DATABASE_URL`) and authoring tokens.
2. Documents under the tenant folder on the files root.
3. Optional: `AI_GATEWAY_API_KEY` for `/docs/propose-ai`.

## Endpoints

Base: `/v1/tenants/:tenantId/authoring/discovery`

| Method | Path                  | Role   | Description                          |
| ------ | --------------------- | ------ | ------------------------------------ |
| GET    | `/docs/status`        | viewer | List collections and file counts     |
| POST   | `/docs/propose`       | editor | Deterministic proposal from files    |
| POST   | `/docs/propose-ai`    | editor | AI-enriched proposal (needs gateway) |
| GET    | `/runs`               | viewer | Recent discovery runs                |
| POST   | `/runs/:runId/review` | editor | Review / apply proposal commands     |

## Errors

- `401` — missing or invalid internal authoring token.
- `422` `files_empty` — no collections under the tenant file root.
- `502` `source_unavailable` — misconfigured files root or IO error.
- `503` `ai_not_configured` — AI propose without `AI_GATEWAY_API_KEY`.

## Local smoke

From `anchor`, with `BACKED_FILES_ROOT` pointing at tenant documents and control-plane env loaded:

```bash
curl -s -H "Authorization: Bearer $CONTROL_PLANE_INTERNAL_TOKEN" \
  "http://127.0.0.1:8791/v1/tenants/gerace/authoring/discovery/docs/status"
```
