export const SERVER_NAME = "backed-model";
export const SERVER_VERSION = "0.1.0";
export const CONFIRMED_STATUS = "confirmed" as const;
export const RULE_MATCH_SCORE = {
    exactId: 100,
    exactName: 90,
    partialName: 70,
    partialDefinition: 50,
} as const;
export const TOOL_NAMES = {
    listEntities: "list_entities",
    getEntity: "get_entity",
    listRelations: "list_relations",
    searchModel: "search_model",
    getDefinition: "get_definition",
} as const;
export const MCP_SURFACE_TOOLS = [
    TOOL_NAMES.listEntities,
    TOOL_NAMES.getEntity,
    TOOL_NAMES.listRelations,
    TOOL_NAMES.searchModel,
    TOOL_NAMES.getDefinition,
] as const;
export type McpSurfaceTool = (typeof MCP_SURFACE_TOOLS)[number];
