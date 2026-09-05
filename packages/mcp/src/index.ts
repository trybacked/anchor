/** Local MCP server: expose model.yaml to AI agents */

export const PACKAGE_NAME = "@backed/mcp" as const;

export { listEntities, getEntity, listRelations, searchModel } from "./mapping.js";
export type { EntitySummary, EntityDetail, SearchMatch } from "./mapping.js";

export { queryEntityRows, queryEntityErrorMessage } from "./data.js";
export type { QueryEntityError, QueryEntityInput, QueryEntityResult, QueryEntityDependencies } from "./data.js";

export { searchDocumentChunks, searchDocumentChunksErrorMessage } from "./search-chunks.js";
export type {
  SearchDocumentChunksError,
  SearchDocumentChunksInput,
  SearchDocumentChunksResult,
} from "./search-chunks.js";

export { traverseRelationRows, traverseRelationErrorMessage } from "./traverse.js";
export type {
  TraverseRelationError,
  TraverseRelationInput,
  TraverseRelationResult,
} from "./traverse.js";

export { createModelMcpServer, startStdioMcpServer } from "./server.js";
export type { ModelMcpServerOptions } from "./server.js";
