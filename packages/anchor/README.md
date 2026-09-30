# @trybacked/anchor

HTTP client for the Anchor API (`apps/api-server`) and the multi-tenant gateway (`/t/{tenantId}/v1/*`).

## Install

Workspace dependency: `"@trybacked/anchor": "workspace:*"`.

## Usage

```ts
import { createAnchorClient, AnchorApiError } from "@trybacked/anchor";

const client = createAnchorClient({
  baseUrl: "https://workshop.example.com/t/gerace",
  credentials: "include",
  onUnauthorized: () => {
    window.location.href = "/login";
  },
});

const entities = await client.listEntities();
const answer = await client.ask({ question: "Quanti contratti a giugno 2025?", evidence: true });
```

Multi-tenant gateway: set `baseUrl` to `{gatewayOrigin}/t/{tenantId}` (no trailing slash required). Session cookies are sent when `credentials: "include"` and the browser is on the same site as the gateway.

Single-tenant gateway: `baseUrl` is the gateway origin; paths are `/v1/*`.

## Methods

| Method | Path |
|--------|------|
| `health` | `GET /health` |
| `listEntities`, `getEntity`, `listRelations`, `searchModel`, `getDefinition` | `/v1/model/*` |
| `objectQuery` | `POST /v1/query/objects` |
| `entitySearch` | `POST /v1/search/entities` |
| `chunkSearch` | `POST /v1/search/chunks` |
| `entityProfile` | `POST /v1/profile/entities` |
| `graphTraverse` | `POST /v1/graph/traverse` |
| `ask` | `POST /v1/chat/ask` |

Request bodies and responses are typed (`ObjectQueryBody`, `SemanticAskResponse`, `RowProvenance`, etc.) — re-exported from this package and from `@trybacked/service`.

## Errors

Failed responses throw `AnchorApiError` with `status` (401, 403, 404, …) and `message` from the API `{ error }` field when present.
