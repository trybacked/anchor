import { SEMANTIC_CHAT_MAX_ROW_LIMIT } from "@trybacked/core";
import { z } from "zod";
export const ROW_FILTER_OPS = [
  "=",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "contains",
  "not_contains",
] as const;
export const COMPILER_FILTER_OPS = [
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
export const RowFilterSchema = z
  .object({
    entityId: z.string().min(1).optional(),
    column: z.string().min(1).optional(),
    propertyId: z.string().min(1).optional(),
    op: z.union([z.enum(ROW_FILTER_OPS), z.enum(COMPILER_FILTER_OPS)]),
    value: z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(z.union([z.string(), z.number(), z.boolean()])),
    ]),
  })
  .superRefine((filter, context) => {
    if (filter.column === undefined && filter.propertyId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each filter needs column or propertyId",
      });
    }
  });
export const AggregateOpSchema = z.object({
  op: z.enum(["sum", "count", "min", "max", "avg"]),
  column: z.string().min(1).optional(),
  propertyId: z.string().min(1).optional(),
  alias: z.string().min(1).optional(),
});
export const TimeRangeSchema = z.object({
  column: z.string().min(1),
  from: z.string().optional(),
  to: z.string().optional(),
});
export const ObjectQueryRequestSchema = z.object({
  entityId: z.string().min(1),
  joins: z.array(z.object({ relationshipId: z.string().min(1) })).optional(),
  select: z.array(z.string().min(1)).optional(),
  filters: z.array(RowFilterSchema).default([]),
  aggregations: z.array(AggregateOpSchema).optional(),
  groupBy: z.array(z.string().min(1)).optional(),
  orderBy: z.string().min(1).optional(),
  orderDirection: z.enum(["asc", "desc"]).optional(),
  limit: z.number().int().positive().max(SEMANTIC_CHAT_MAX_ROW_LIMIT).optional(),
  mode: z.enum(["rows", "count"]).optional(),
  documentIds: z.array(z.string()).optional(),
  textSearch: z
    .object({
      query: z.string().min(1),
      entityId: z.string().min(1).optional(),
      columns: z.array(z.string().min(1)).optional(),
    })
    .optional(),
});
export const ObjectSetDefinitionSchema = z.object({
  entityId: z.string().min(1),
  filters: z.array(RowFilterSchema).default([]),
  documentIds: z.array(z.string()).optional(),
  timeRange: TimeRangeSchema.optional(),
  limit: z.number().int().positive().optional(),
});
export const SemanticQueryPlanSchema = z.object({
  reasoning: z.string().optional(),
  objectQuery: ObjectQueryRequestSchema,
  objectSet: ObjectSetDefinitionSchema.optional(),
});
export const RoutedSemanticPlanSchema = z
  .object({
    route: z.enum(["single", "template"]),
    reasoning: z.string().optional(),
    objectQuery: ObjectQueryRequestSchema.optional(),
    objectSet: ObjectSetDefinitionSchema.optional(),
    templateId: z.string().min(1).optional(),
    params: z.record(z.union([z.string(), z.number()])).optional(),
  })
  .superRefine((plan, context) => {
    if (plan.route === "single") {
      if (plan.objectQuery === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'route "single" requires objectQuery',
        });
      }
      return;
    }
    if (plan.templateId === undefined || plan.templateId.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'route "template" requires templateId',
      });
    }
    if (plan.params === undefined || Object.keys(plan.params).length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'route "template" requires params',
      });
    }
  });
export type RowFilter = z.infer<typeof RowFilterSchema>;
export type ObjectQueryRequest = z.infer<typeof ObjectQueryRequestSchema>;
export type ObjectSetDefinition = z.infer<typeof ObjectSetDefinitionSchema>;
export type SemanticQueryPlan = z.infer<typeof SemanticQueryPlanSchema>;
export type RoutedSemanticPlan = z.infer<typeof RoutedSemanticPlanSchema>;
