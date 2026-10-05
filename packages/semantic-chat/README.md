# @trybacked/semantic-chat

Natural-language **ask** over a published ontology and warehouse: an LLM agent calls the same governed tools as MCP/API (`query_objects`, schema search, optional docs readers), then finishes with **`submit_answer`** or **`ask_clarification`**. Numbers in the answer must appear in tool results (grounding + optional repair turn).

A separate **plan engine** (`createSemanticChatEngine`) still exists for deterministic translate → validate → execute workflows and tests; production **POST /v1/chat/ask** uses **`runSemanticAgent`**.

## Agent flow (production)

```text
Question
  → applySemanticCatalogs(ontology, shared packs)
  → system prompt (schema slice + glossary + examples)
  → tool loop (AI SDK, toolChoice required)
       search_schema | get_entity | get_property_values | query_objects
       [search_documents | get_entity_profile | traverse_graph if enabled]
       submit_answer | ask_clarification
  → grounding (rebind claims to toolCallId evidence)
  → optional repair generation if a cited number is missing
  → SemanticAgentResult
```

Budget defaults live in `src/agent/limits.ts` (`DEFAULT_AGENT_BUDGET` in `types.ts`).

## Attach to a tenant service

```typescript
import { attachSemanticAsk } from "@trybacked/semantic-chat";
import { createSemanticAgentModelFromEnv } from "@trybacked/semantic-chat";

const model = createSemanticAgentModelFromEnv(process.env);
if (model !== undefined) {
  attachSemanticAsk(anchorService, { ontology, ...model });
}
```

## Run the agent directly (tests, scripts)

```typescript
import { runSemanticAgent, DEFAULT_AGENT_BUDGET } from "@trybacked/semantic-chat";

const result = await runSemanticAgent({
  ontology,
  service: anchorService,
  question: "How many rows for load month 2025-06?",
  apiKey: process.env.AI_GATEWAY_API_KEY!,
  modelId: "openai/gpt-4o-mini",
  budget: DEFAULT_AGENT_BUDGET,
});

// result.answer, result.claims, result.steps, result.clarification?, result.usage
```

## Plan engine (legacy / eval helpers)

```typescript
import { createSemanticChatEngine } from "@trybacked/semantic-chat";

const engine = createSemanticChatEngine({ ontology, queryRuntime, translate });
const answer = await engine.executePlan({ objectQuery: { objectId: "customer", mode: "count" } });
```

## Key modules

| Path                      | Role                                                              |
| ------------------------- | ----------------------------------------------------------------- |
| `agent/run-agent.ts`      | Main loop, fallback model, grounding repair                       |
| `agent/build-tools.ts`    | Tool definitions; `ObjectQuerySchema` derived for `query_objects` |
| `agent/grounding.ts`      | Claim ↔ tool result validation and citation rebind                |
| `agent/prompt-builder.ts` | System policy + ontology context                                  |
| `create-semantic-ask.ts`  | Maps agent result → HTTP `SemanticAskResponse`                    |

HTTP contract and workshop notes: `apps/api-server/docs/AI-ASK.md`, `WORKSHOP-AI-ASK.md`.
