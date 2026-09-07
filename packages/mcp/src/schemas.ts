import { ElementStatusSchema, ProvenanceSchema, PropertyRoleSchema, SemanticTypeSchema, } from "@backed/core";
import { z } from "zod";
export const EntitySummarySchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    status: ElementStatusSchema,
});
export const EntityPropertySchema = z.object({
    name: z.string(),
    columnName: z.string(),
    semanticType: SemanticTypeSchema,
    role: PropertyRoleSchema,
    provenance: ProvenanceSchema,
});
export const EntityDetailSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    status: ElementStatusSchema,
    provenance: ProvenanceSchema,
    properties: z.array(EntityPropertySchema),
});
export const RelationSummarySchema = z.object({
    id: z.string(),
    name: z.string(),
    fromEntity: z.string(),
    toEntity: z.string(),
    fromColumn: z.string(),
    toColumn: z.string(),
    cardinality: z.enum(["one_to_one", "one_to_many", "many_to_many"]),
    status: ElementStatusSchema,
});
export const SearchMatchSchema = z.object({
    kind: z.enum(["entity", "property", "relation", "rule"]),
    id: z.string(),
    name: z.string(),
    snippet: z.string(),
});
export const DefinitionFoundSchema = z.object({
    found: z.literal(true),
    id: z.string(),
    name: z.string(),
    definition: z.string(),
    appliesTo: z.string(),
    column: z.string().optional(),
    status: z.literal("confirmed"),
    provenance: ProvenanceSchema,
});
export const DefinitionNotFoundSchema = z.object({
    found: z.literal(false),
    term: z.string(),
    message: z.string(),
});
export const DefinitionResultSchema = z.discriminatedUnion("found", [
    DefinitionFoundSchema,
    DefinitionNotFoundSchema,
]);
export type EntitySummary = z.infer<typeof EntitySummarySchema>;
export type EntityDetail = z.infer<typeof EntityDetailSchema>;
export type RelationSummary = z.infer<typeof RelationSummarySchema>;
export type SearchMatch = z.infer<typeof SearchMatchSchema>;
export type DefinitionResult = z.infer<typeof DefinitionResultSchema>;
export function validateModelPayload<T>(schema: z.ZodType<T>, payload: T): T {
    return schema.parse(payload);
}
