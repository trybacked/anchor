/** MCP server locale: esposizione modello.yaml ad agenti AI */

export const PACKAGE_NAME = "@backed/mcp" as const;

export { listEntities, getEntity, listRelations, searchModel } from "./mapping.js";
export type { EntitySummary, EntityDetail, SearchMatch } from "./mapping.js";

export { createModelMcpServer, startStdioMcpServer } from "./server.js";
