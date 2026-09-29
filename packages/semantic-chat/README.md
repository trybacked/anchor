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

const engine = createSemanticChatEngine({
  ontology,
  queryRuntime,
  translate: async ({ prompt }) => openAiChat(prompt), // return JSON string only
});

const answer = await engine.ask("Quanti contratti per il comune di Gerace?");
// answer.plan.objectQuery, answer.result.rows, answer.provenance[]
```

Skip the LLM with `engine.executePlan({ objectQuery: { entityId: "contract", mode: "count", filters: [] } })`.

## Provenance

Each row includes `entity` (object id/name/dataset), full `row` values, and optional `document` (`documentId`, `pageStart`, `pageEnd`, …) when the row carries `document_id` / page columns.
