# @backed/mcp

Local MCP server exposing the Anchor semantic model as five deterministic, Zod-validated operations.

## MCP surface

| Tool | Purpose |
|---|---|
| `list_entities` | Entity summaries: id, name, description, status |
| `get_entity` | Entity detail with properties (semanticType, role, provenance) |
| `list_relations` | Relations with cardinality and status; optional `id` filter |
| `search_model` | Semantic document-chunk search when DuckDB vectors are available, merged with case-insensitive substring match |
| `get_definition` | Confirmed business rule with provenance, or structured not-found |

No LLM inference occurs in the MCP path. `search_model` may embed the query locally when chunk vectors exist in `.backed/data.duckdb`. Data is read from `model.yaml` and the local DuckDB snapshot.

## Usage

Started by `backed serve` (local by default). Set `BACKED_TELEMETRY=1` after `backed login` to opt in to background usage metering — failures never block tool calls.

```typescript
import { createModelMcpServer, runStdioMcpServerUntilClose } from "@backed/mcp";
```
