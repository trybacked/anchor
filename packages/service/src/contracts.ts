import { ObjectQuerySchema } from "@trybacked/compiler";
import { z } from "zod";
export const ListRelationsQuerySchema = z.object({
  entityId: z.string().min(1).optional(),
});
export const SearchModelBodySchema = z.object({
  query: z.string().min(1),
});
export const GetDefinitionBodySchema = z.object({
  term: z.string().min(1),
});
export const ObjectQueryBodySchema = ObjectQuerySchema;
export const EntitySearchBodySchema = z.object({
  query: z.string().min(1),
  kinds: z
    .array(z.enum(["entity", "property", "relation", "rule"]))
    .optional()
    .describe("If set, filter search_model matches to these kinds"),
});
export const ChunkSearchBodySchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(100).optional(),
  minScore: z.number().min(0).max(1).optional(),
  documentIds: z.array(z.string()).optional(),
});
export const SemanticAskBodySchema = z.object({
  question: z.string().min(1),
  evidence: z.boolean().optional(),
});
export const EntityProfileBodySchema = z.object({
  name: z.string().min(1),
  matchLimit: z.number().int().positive().max(10).optional(),
  factLimit: z.number().int().positive().max(100).optional(),
  documentLimit: z.number().int().positive().max(100).optional(),
});
export const GraphTraverseBodySchema = z.object({
  relationId: z.string().min(1),
  value: z.union([z.string(), z.number()]),
  direction: z.enum(["forward", "reverse"]).optional(),
  depth: z.number().int().min(1).max(3).optional(),
  limit: z.number().int().positive().max(1000),
  mode: z.enum(["rows", "count"]).optional(),
  filters: z
    .array(
      z.object({
        objectId: z.string().min(1).optional(),
        propertyId: z.string().min(1),
        op: z.enum([
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
        ]),
        value: z.union([
          z.string(),
          z.number(),
          z.boolean(),
          z.null(),
          z.array(z.union([z.string(), z.number(), z.boolean()])),
        ]),
      }),
    )
    .optional(),
});
export type ObjectQueryBody = z.infer<typeof ObjectQueryBodySchema>;
export type SemanticAskBody = z.infer<typeof SemanticAskBodySchema>;
export type EntitySearchBody = z.infer<typeof EntitySearchBodySchema>;
export type ChunkSearchBody = z.infer<typeof ChunkSearchBodySchema>;
export type EntityProfileBody = z.infer<typeof EntityProfileBodySchema>;
export type GraphTraverseBody = z.infer<typeof GraphTraverseBodySchema>;
