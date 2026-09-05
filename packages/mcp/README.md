# @backed/mcp

Local MCP server: client AI agents query the confirmed ontology (`model.yaml`).

**Responsibilities:**

- Pure, testable mapping over `SemanticModel`: `listEntities`, `getEntity` (with linked relations and rules), `listRelations`, `searchModel`.
- `queryEntityRows(model, reader, input)` — validates entity id, filter columns, and row limit against the ontology before delegating to a `RowReader` from `@backed/ingest`.
- `createModelMcpServer(model, options?)` — `McpServer` with tools `list_entities`, `get_entity`, `list_relations`, `search_model` (English descriptions). Registers `query_entity` only when `options.rowReader` is provided.
- `startStdioMcpServer(model, options?)` — stdio transport startup (used by `backed serve`).

**Data access:** `backed model` persists ingested tables to `.backed/data.duckdb`. `backed serve` opens that snapshot read-only and passes a row reader to the MCP server. Structured filters only — no raw SQL.

**Does not contain:** pipeline, ingest SQL, LLM.
