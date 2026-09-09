export const PACKAGE_NAME = "@backed/mcp" as const;
export { listEntities, getEntity, listRelations, searchModel, getDefinition, } from "./mapping.js";
export type { SearchModelOptions } from "./mapping.js";
export type { EntitySummary, EntityDetail, RelationSummary, SearchMatch, DefinitionResult, } from "./mapping.js";
export { EntitySummarySchema, EntityDetailSchema, RelationSummarySchema, SearchMatchSchema, DefinitionResultSchema, } from "./schemas.js";
export { createModelMcpServer, runStdioMcpServerUntilClose, startStdioMcpServer, } from "./server.js";
export type { ModelMcpServerOptions, McpSurfaceOperation, ServeUsageRecorder, } from "./server.js";
export { MCP_SURFACE_TOOLS, TOOL_NAMES, SERVER_NAME, SERVER_VERSION } from "./constants.js";
export { entityNotFoundMessage } from "./errors.js";
