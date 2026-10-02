# @trybacked/semantic-chat

Reusable chat engine for workshop and product UIs: **LLM translates** natural language into `ObjectQueryRequest` / `ObjectSetDefinition`, then **deterministic** validation, compile, and warehouse execution. Every answer includes **provenance** (entity → row → document → page when columns exist).

## Flow

```text
Question → translate (LLM) → SemanticQueryPlan JSON
        → normalize → validate against ontology
        → queryRuntime.queryObjects → rows + SQL
        → provenance enrichment
```

## Usage

```typescript
import { createSemanticChatEngine } from "@trybacked/semantic-chat";
import { createOntologyQueryRuntime } from "@trybacked/runtime";

import { createVercelAiTranslatorFromEnv } from "@trybacked/semantic-chat/adapters/vercel-ai";

const translate = createVercelAiTranslatorFromEnv(process.env);
if (translate === undefined) {
  throw new Error("Set AI_GATEWAY_API_KEY");
}

const engine = createSemanticChatEngine({
  ontology,
  queryRuntime,
  translate,
});

const answer = await engine.ask("How many contracts for the municipality of Gerace?");
// answer.plan.objectQuery, answer.result.rows, answer.provenance[]
```

Skip the LLM with `engine.executePlan({ objectQuery: { entityId: "contract", mode: "count", filters: [] } })`.

## Provenance

Each row includes `entity` (object id/name/dataset), full `row` values, and optional `document` (`documentId`, `pageStart`, `pageEnd`, …) when the row carries `document_id` / page columns.
