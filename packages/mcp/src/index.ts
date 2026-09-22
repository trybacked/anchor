export const PACKAGE_NAME = "@trybacked/mcp" as const;
export { listEntities, getEntity, listRelations, searchModel, getDefinition } from "./mapping.js";
export type { SearchModelOptions } from "./mapping.js";
export type {
  EntitySummary,
  EntityDetail,
  RelationSummary,
  SearchMatch,
  DefinitionResult,
} from "./mapping.js";
export {
  EntitySummarySchema,
  EntityDetailSchema,
  RelationSummarySchema,
  SearchMatchSchema,
  DefinitionResultSchema,
} from "./schemas.js";
export {
  createModelMcpServer,
  runStdioMcpServerUntilClose,
  startStdioMcpServer,
} from "./server.js";
export type { ModelMcpServerOptions, McpSurfaceOperation, ServeUsageRecorder } from "./server.js";
export {
  MCP_QUERY_TOOL,
  MCP_SURFACE_TOOLS,
  TOOL_NAMES,
  SERVER_NAME,
  SERVER_VERSION,
  type McpSurfaceTool,
} from "./constants.js";
export { MCP_TOOL_DEFINITIONS, QUERY_OBJECTS_TOOL_DEFINITION } from "./tools.js";
export type { ToolContext, ToolDefinition } from "./tools.js";
export { entityNotFoundMessage } from "./errors.js";
