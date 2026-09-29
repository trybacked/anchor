import { z } from "zod";

export const OBJECT_QUERY_FILTER_OPS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "not_contains",
  "in",
  "not_in",
  "is_null",
  "is_not_null",
  "starts_with",
] as const;

export const OBJECT_QUERY_MODES = ["rows", "count"] as const;

export const OBJECT_QUERY_AGGREGATE_OPS = ["sum", "count", "min", "max", "avg"] as const;

export const DEFAULT_OBJECT_QUERY_LIMIT = 100;
export const MAX_OBJECT_QUERY_LIMIT = 1000;

export const ObjectQueryJoinSchema = z.object({
  relationshipId: z.string().min(1).describe("Published ontology relationship id"),
});

export const ObjectQueryTextSearchSchema = z.object({
  query: z.string().min(1),
  objectId: z
    .string()
    .min(1)
    .optional()
    .describe("Defaults to the query root objectId; must be on the join graph"),
  propertyIds: z
    .array(z.string().min(1))
    .optional()
    .describe("String columns to search; default = all string properties on the object"),
});

export const ObjectQueryAggregationSchema = z.object({
  op: z.enum(OBJECT_QUERY_AGGREGATE_OPS),
  propertyId: z.string().min(1).optional(),
  alias: z.string().min(1).optional(),
});

export const ObjectQueryFilterSchema = z.object({
  objectId: z
    .string()
    .min(1)
    .optional()
    .describe("Ontology object id (default: query root). Use after joins to filter related objects."),
  propertyId: z.string().min(1),
  op: z.enum(OBJECT_QUERY_FILTER_OPS),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.union([z.string(), z.number(), z.boolean()])),
  ]),
});

export const ObjectQuerySchema = z.object({
  objectId: z.string().min(1),
  joins: z.array(ObjectQueryJoinSchema).optional().describe("Relationship chain from the root object"),
  select: z
    .array(z.string().min(1))
    .optional()
    .describe('Property ids or "objectId.propertyId" for joined projection (uses INNER JOIN)'),
  filters: z.array(ObjectQueryFilterSchema).default([]),
  textSearch: ObjectQueryTextSearchSchema.optional().describe("Case-insensitive contains across string columns (OR)"),
  mode: z.enum(OBJECT_QUERY_MODES).default("rows"),
  limit: z.number().int().positive().max(MAX_OBJECT_QUERY_LIMIT).optional(),
  groupBy: z.array(z.string().min(1)).optional(),
  aggregations: z.array(ObjectQueryAggregationSchema).optional(),
  orderBy: z.string().min(1).optional(),
  orderDirection: z.enum(["asc", "desc"]).optional(),
});

export type ObjectQueryFilterOp = (typeof OBJECT_QUERY_FILTER_OPS)[number];
export type ObjectQueryFilter = z.infer<typeof ObjectQueryFilterSchema>;
export type ObjectQueryJoin = z.infer<typeof ObjectQueryJoinSchema>;
export type ObjectQueryTextSearch = z.infer<typeof ObjectQueryTextSearchSchema>;
export type ObjectQueryAggregation = z.infer<typeof ObjectQueryAggregationSchema>;
/** Pre-parse query payload (`mode` and `filters` optional; defaults applied in compile). */
export type ObjectQuery = z.input<typeof ObjectQuerySchema>;

/** Named parameter bound to the compiled statement. */
export type SqlParameter = {
  name: string;
  value: string | number | boolean;
};

/** Parameterized SQL statement produced by the compiler. */
export type CompiledObjectQuery = {
  objectId: string;
  sql: string;
  parameters: SqlParameter[];
  columns: string[];
  /** Objects present in FROM/JOIN (root first). */
  joinedObjectIds?: string[];
};
