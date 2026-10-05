# AI ask (workshop backend)

Natural-language questions over the **published ontology** and **warehouse** (counts, filters, listings, joins, optional document archive when enabled).

**Workshop handout (IT):** [WORKSHOP-AI-ASK.md](./WORKSHOP-AI-ASK.md).

## Endpoints (per tenant)

| Method | Path                  | Purpose                                                 |
| ------ | --------------------- | ------------------------------------------------------- |
| `GET`  | `/v1/chat/ask/status` | `{ available: true }` or `{ available: false, reason }` |
| `POST` | `/v1/chat/ask`        | Body `{ "question": "..." }` → answer payload           |

Requires tenant header/path as for other `/v1/*` routes.

## When ask works

1. Ontology published for the tenant.
2. Warehouse/query runtime available (`AnchorService.objectQuery`).
3. **`AI_GATEWAY_API_KEY`** on **platform-api** (Vercel AI Gateway).

No per-tenant enable flag by default. To block one tenant: `capabilities.aiAsk: false` in `tenants.yaml`.

## Runtime configuration (platform-api env)

| Variable                                  | Purpose                                         |
| ----------------------------------------- | ----------------------------------------------- |
| `AI_GATEWAY_API_KEY`                      | Required for ask                                |
| `SEMANTIC_CHAT_MODEL` or `SEMANTIC_MODEL` | Gateway model id (default `openai/gpt-4o-mini`) |
| `SEMANTIC_CHAT_FALLBACK_MODEL`            | Optional second model if the primary call fails |
| `SEMANTIC_AGENT_MAX_STEPS`                | Tool-step cap (default **8**)                   |
| `SEMANTIC_AGENT_MAX_SQL_CALLS`            | Warehouse call cap (default **4**)              |
| `SEMANTIC_AGENT_SKIP_REPAIR_AFTER_MS`     | Skip grounding repair if main pass ≥ ms (default **35000**) |

Shared **semantic catalogs** (synonyms, default time dimensions, glossary) are applied automatically from ontology-authoring packs when the agent runs; tenants do not configure this per ask.

## Agent behavior (summary)

- **Route:** always **`agent`** (no template/plan route on HTTP).
- **Tools:** same governed surface as MCP — especially `query_objects` with filters, joins, `textSearch`, `groupBy` / aggregations, `orderBy`.
- **Budget (defaults):** 8 tool steps, 4 warehouse-backed calls, 50 rows max per `query_objects`; document archive tools are omitted for contract/region questions on ANAC-only tenants (see `@trybacked/semantic-chat`).
- **Grounding:** every number in the answer must exist in a tool result; claims are rebound to the matching `toolCallId` when unambiguous. If the same value appears in multiple successful queries, the agent must cite the correct call or grounding fails. One repair pass may run if grounding fails.
- **Warehouse budget:** only **successful** warehouse tool calls count toward the SQL budget, so compile/SQL errors can be retried without instantly exhausting the limit.
- **Clarification:** `ask_clarification` only when ontology semantics cannot resolve material ambiguity (policy in `clarification-policy`).

## Response shape (workshop UI)

Use these fields from `POST /v1/chat/ask`:

| Field                              | Meaning                                                             |
| ---------------------------------- | ------------------------------------------------------------------- |
| **`answer`** / **`text`**          | User-facing prose                                                   |
| **`clarification`**                | `{ question, options[] }` when the user must pick an interpretation |
| **`claims`**                       | `{ text, toolCallId }[]` backing numeric statements                 |
| **`assumptions`**, **`followUps`** | Agent metadata                                                      |
| **`agentSteps`**                   | Tool trace (see below)                                              |
| **`usage`**                        | `{ inputTokens, outputTokens, totalTokens, latencyMs }`             |
| **`runId`**                        | Correlate feedback or support                                       |

### `agentSteps` entries

Each step includes:

- **`toolName`**, **`toolCallId`**, **`input`**, **`durationMs`**
- **`status`**: `"ok"` \| `"error"`
- **`error`**: present when `status === "error"` (warehouse/validation message — useful in demos)
- **`rowCount`**, **`sql`**: when the tool returned query metadata

Legacy plan/template fields are unused.

## Client SDK

```ts
const status = await tenant.ai.status();
if (status.available) {
  const reply = await tenant.ai.ask({ question: "How many rows for load month 2025-06?" });
  for (const step of reply.agentSteps ?? []) {
    if (step.status === "error") console.warn(step.toolName, step.error);
  }
}
```

## Errors

| HTTP | Meaning                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------- |
| 503  | Ask not available — check `GET .../status` (`missing_llm_gateway` or `disabled_for_tenant`)                         |
| 422  | Agent could not complete (`SemanticAgentError`: validation, grounding after repair, budget, clarification rejected) |

## Implementation map

| Layer               | Package / path                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------ |
| HTTP                | `apps/api-server` → `resolveChatAsk` / `getChatAskStatus` (`@trybacked/service`)           |
| Agent               | `@trybacked/semantic-chat` → `runSemanticAgent`, `attachSemanticAsk`                       |
| Query compile + SQL | `@trybacked/compiler`, `@trybacked/runtime`                                                |
| Limits              | `@trybacked/core` (warehouse rows), `semantic-chat/src/agent/limits.ts` (steps/SQL/prompt) |
