/** Local MCP server: expose model.yaml to AI agents */

export const PACKAGE_NAME = "@backed/mcp" as const;

export { listEntities, getEntity, listRelations, searchModel } from "./mapping.js";
export type { EntitySummary, EntityDetail, SearchMatch } from "./mapping.js";

export { queryEntityRows, queryEntityErrorMessage } from "./data.js";
export type { QueryEntityError, QueryEntityInput, QueryEntityResult } from "./data.js";

export { createModelMcpServer, startStdioMcpServer } from "./server.js";
export type { ModelMcpServerOptions } from "./server.js";
