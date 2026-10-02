# @trybacked/service

Single implementation of Anchor runtime capabilities used by:

- **`apps/api-server`** — HTTP + OpenAPI
- **`@trybacked/mcp`** — MCP tools (thin adapters)
- **`@trybacked/anchor`** — HTTP SDK

Capabilities:

| Operation                              | Status                                              |
| -------------------------------------- | --------------------------------------------------- |
| Model (`listEntities`, `getEntity`, …) | Implemented                                         |
| `objectQuery` (object-query-reader)    | Requires published ontology + warehouse             |
| `entitySearch`                         | Implemented (filtered `searchModel`)                |
| `chunkSearch`                          | Document archive (requires catalog + `docs` schema) |
| `entityProfile`                        | Precomputed `entity_profiles` lookup                |
| `graphTraverse`                        | Multi-hop joins on semantic relations               |
