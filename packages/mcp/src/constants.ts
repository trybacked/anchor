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
  searchSchema: "search_schema",
  getPropertyValues: "get_property_values",
  getDefinition: "get_definition",
  queryObjects: "query_objects",
  searchDocuments: "search_documents",
  getEntityProfile: "get_entity_profile",
  traverseGraph: "traverse_graph",
  askSemantic: "ask_semantic",
} as const;
export const MCP_SURFACE_TOOLS = [
  TOOL_NAMES.listEntities,
  TOOL_NAMES.getEntity,
  TOOL_NAMES.listRelations,
  TOOL_NAMES.searchModel,
  TOOL_NAMES.searchSchema,
  TOOL_NAMES.getPropertyValues,
  TOOL_NAMES.getDefinition,
] as const;
export const MCP_QUERY_TOOL = TOOL_NAMES.queryObjects;
export const MCP_WAREHOUSE_READER_TOOLS = [
  TOOL_NAMES.searchDocuments,
  TOOL_NAMES.getEntityProfile,
  TOOL_NAMES.traverseGraph,
] as const;
export type McpSurfaceTool = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];
