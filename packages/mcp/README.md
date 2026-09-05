# @backed/mcp

Local MCP server: client AI agents query the confirmed ontology (`model.yaml`).

**Responsibilities:**

- Pure, testable mapping over `SemanticModel`: `listEntities`, `getEntity` (with linked relations and rules), `listRelations`, `searchModel`.
- `queryEntityRows(model, reader, input, dependencies?)` — validates entity id, filter columns, and row limit. Optional `text` routes to chunk search (documents) or substring search on text columns (structured data). Pass `chunkSearcher` in dependencies for document text search.
- `searchDocumentChunks(model, searcher, input)` — internal chunk search helper (used by `queryEntityRows`).
- `createModelMcpServer(model, options?)` — `McpServer` with tools `list_entities`, `get_entity`, `list_relations`, `search_model`, `query_entity` (when `options.rowReader` is set). Pass `options.chunkSearcher` to enable document text search inside `query_entity`.
- `startStdioMcpServer(model, options?)` — stdio transport startup (used by `backed serve`).

**Data access:** `backed model` persists ingested tables to `.backed/data.duckdb`. `backed serve` opens that snapshot read-only. Agents use `query_entity` only — structured filters or free-text search. No raw SQL.

**Does not contain:** pipeline, ingest SQL, LLM.
