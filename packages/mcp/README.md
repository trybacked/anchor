# @backed/mcp

MCP server locale: gli agenti AI del cliente consultano l'ontologia confermata (`modello.yaml`).

**Responsabilità:**

- Mapping puro e testabile su `SemanticModel`: `listEntities`, `getEntity` (con relazioni e regole collegate), `listRelations`, `searchModel`.
- `createModelMcpServer(model)` — `McpServer` con i tool `list_entities`, `get_entity`, `list_relations`, `search_model` (descrizioni in italiano).
- `startStdioMcpServer(model)` — avvio su transport stdio (usato da `backed serve`).

**Non contiene:** pipeline, ingest, LLM.
