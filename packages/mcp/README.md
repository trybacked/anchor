# @backed/mcp

Local MCP server exposing the Anchor semantic model as five deterministic, Zod-validated operations.

## MCP surface

| Tool | Purpose |
|---|---|
| `list_entities` | Entity summaries: id, name, description, status |
| `get_entity` | Entity detail with properties (semanticType, role, provenance) |
| `list_relations` | Relations with cardinality and status; optional `entity_id` filter |
| `search_model` | Case-insensitive text match on names and definitions (no vectors) |
| `get_definition` | Confirmed business rule with provenance, or structured not-found |

No LLM calls occur in the MCP path. Data is read from `model.yaml` only.

## Usage

Started by `backed serve` after `backed login`. The CLI verifies gateway reachability, validates the stored Bearer token, and records one usage event per tool call (operation name only — no model payload leaves the machine).

```typescript
import { createModelMcpServer, runStdioMcpServerUntilClose } from "@backed/mcp";
```
