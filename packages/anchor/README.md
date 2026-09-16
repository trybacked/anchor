# @trybacked/anchor

Official TypeScript SDK for the [Anchor worker HTTP API](https://github.com/trybacked/anchor).

Types are generated from [`apps/worker-service/openapi.yaml`](../../apps/worker-service/openapi.yaml) using [openapi-typescript](https://github.com/openapi-ts/openapi-typescript). Runtime requests use [openapi-fetch](https://github.com/openapi-ts/openapi-typescript/tree/main/packages/openapi-fetch).

## Install

```bash
pnpm add @trybacked/anchor
```

During monorepo development:

```bash
pnpm --filter @trybacked/anchor build
```

## Quick start

```typescript
import { createAnchorClient } from "@trybacked/anchor";

const anchor = createAnchorClient({
  baseUrl: "https://anchor.backed.app",
  token: process.env.ANCHOR_API_TOKEN!,
});

const health = await anchor.health();

const { runId } = await anchor.submitRun("demo", [
  { filename: "export.csv", content: csvBuffer },
]);

const finalStatus = await anchor.waitForRun("demo", runId, {
  intervalMs: 2_000,
});

const modelResult = await anchor.getModel("demo");
if (!("notModified" in modelResult)) {
  console.log(modelResult.model.entities.length);
}
```

## API surface

| Method | Worker route |
|--------|----------------|
| `health()` | `GET /health` |
| `submitRun(tenantId, files)` | `POST /v1/tenants/:tenantId/runs` |
| `getRunStatus(tenantId, runId)` | `GET /v1/tenants/:tenantId/runs/:runId` |
| `waitForRun(tenantId, runId)` | Poll helper |
| `getModel(tenantId)` | `GET /v1/tenants/:tenantId/model` |
| `getReviewQuestions(tenantId)` | `GET /v1/tenants/:tenantId/review` |
| `submitReview(tenantId, body)` | `POST /v1/tenants/:tenantId/review` |
| `listDeletions(tenantId, query?)` | `GET /v1/tenants/:tenantId/audit/deletions` |
| `getLedger(tenantId)` | `GET /v1/tenants/:tenantId/audit/ledger` |

## Webhooks

Verify inbound `run.completed` webhooks from Anchor:

```typescript
import {
  verifyWebhookSignature,
  parseRunCompletedWebhook,
  WEBHOOK_SIGNATURE_HEADER,
} from "@trybacked/anchor";

const body = await request.text();
const signature = request.headers.get(WEBHOOK_SIGNATURE_HEADER) ?? "";

if (!verifyWebhookSignature(body, process.env.WEBHOOK_SECRET!, signature)) {
  return new Response("invalid signature", { status: 401 });
}

const event = parseRunCompletedWebhook(body);
```

## Regenerating types

When the worker OpenAPI spec changes:

```bash
pnpm --filter @trybacked/anchor generate:openapi
```

## License

Apache-2.0
