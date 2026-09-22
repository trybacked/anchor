import { z } from "zod";

export const OBJECT_QUERY_FILTER_OPS = ["eq", "neq", "gt", "gte", "lt", "lte"] as const;

export const DEFAULT_OBJECT_QUERY_LIMIT = 100;
export const MAX_OBJECT_QUERY_LIMIT = 1000;

export const ObjectQueryFilterSchema = z.object({
  propertyId: z.string().min(1),
  op: z.enum(OBJECT_QUERY_FILTER_OPS),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

export const ObjectQuerySchema = z.object({
  objectId: z.string().min(1),
  filters: z.array(ObjectQueryFilterSchema).default([]),
  limit: z.number().int().positive().max(MAX_OBJECT_QUERY_LIMIT).optional(),
});

export type ObjectQueryFilterOp = (typeof OBJECT_QUERY_FILTER_OPS)[number];
export type ObjectQueryFilter = z.infer<typeof ObjectQueryFilterSchema>;
export type ObjectQuery = z.infer<typeof ObjectQuerySchema>;

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
};
