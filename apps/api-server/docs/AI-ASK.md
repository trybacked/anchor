# AI ask (workshop backend)

Natural-language questions over the **published ontology** and **warehouse** (contracts, dates, organizations, filters, counts, top-N).

## Endpoints (per tenant)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/v1/chat/ask/status` | `{ available: true }` or `{ available: false, reason }` |
| `POST` | `/v1/chat/ask` | Body `{ "question": "..." }` → answer payload |

Requires tenant header/path as for other `/v1/*` routes.

## When ask works

1. Ontology published for the tenant.
2. Warehouse/query runtime available.
3. **`AI_GATEWAY_API_KEY`** on **platform-api** (Vercel AI Gateway).

No per-tenant enable flag by default. To block one tenant: `capabilities.aiAsk: false` in `tenants.yaml`.

## Response shape (workshop UI)

Use these fields from `POST /v1/chat/ask`:

- **`answer`** (alias **`text`**) — user-facing prose.
- **`clarification`** — `{ question, options[] }` when the agent needs a disambiguation pick.
- **`agentSteps`** — tool trace (optional “show SQL”); entries may include `sql`, `rowCount`, `toolName`.
- **`runId`** — correlate feedback or support.

Legacy plan/template fields are unused; **`route`** is always **`agent`**.

## Client SDK

```ts
const status = await tenant.ai.status();
if (status.available) {
  const reply = await tenant.ai.ask({ question: "Quanti contratti a giugno 2025?" });
}
```

## Errors

| HTTP | Meaning |
|------|---------|
| 503 | Ask not available — check `GET .../status` (`missing_llm_gateway` or `disabled_for_tenant`) |
| 422 | Agent could not complete (validation, grounding, budget) |
