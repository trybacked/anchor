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
/** Prior turns accepted per ask; older turns are the client's to drop. */
export const SEMANTIC_ASK_MAX_HISTORY_TURNS = 12;
export const SEMANTIC_ASK_MAX_TURN_CHARS = 2_000;
export const ConversationTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(SEMANTIC_ASK_MAX_TURN_CHARS),
  /** The governed query that produced an assistant turn, when the client kept it. */
  query: ObjectQuerySchema.optional(),
});
export const SemanticAskBodySchema = z.object({
  question: z.string().min(1),
  evidence: z.boolean().optional(),
  /** BCP-47 language of the user interface; wins over Accept-Language. */
  locale: z.string().min(2).max(8).optional(),
  /** Client-side chat identifier, used for audit correlation only. */
  conversationId: z.string().min(1).max(128).optional(),
  /** Earlier turns of the same chat, oldest first, excluding the current question. */
  history: z.array(ConversationTurnSchema).max(SEMANTIC_ASK_MAX_HISTORY_TURNS).optional(),
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
export type ConversationTurn = z.infer<typeof ConversationTurnSchema>;
export type EntitySearchBody = z.infer<typeof EntitySearchBodySchema>;
export type ChunkSearchBody = z.infer<typeof ChunkSearchBodySchema>;
export type EntityProfileBody = z.infer<typeof EntityProfileBodySchema>;
export type GraphTraverseBody = z.infer<typeof GraphTraverseBodySchema>;
