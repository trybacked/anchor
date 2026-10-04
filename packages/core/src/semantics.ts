import { z } from "zod";

export const SemanticPropertyRoleSchema = z.enum([
  "time_dimension",
  "partition",
  "measure",
  "label",
  "identifier",
]);

export const PropertySemanticsSchema = z.object({
  description: z.string().min(1).optional(),
  synonyms: z.array(z.string().min(1)).optional(),
  valueFormat: z.string().min(1).optional(),
  sampleValues: z.array(z.string()).optional(),
  semanticRole: SemanticPropertyRoleSchema.optional(),
});

export const EntitySemanticsSchema = z.object({
  synonyms: z.array(z.string().min(1)).optional(),
  displayProperties: z.array(z.string().min(1)).optional(),
  defaultTimeDimension: z.string().min(1).optional(),
});

export const GlossaryTermSchema = z.object({
  id: z.string().min(1),
  term: z.string().min(1),
  definition: z.string().min(1),
  objectId: z.string().min(1).optional(),
  propertyId: z.string().min(1).optional(),
});

export const VerifiedExampleSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  tags: z.array(z.string().min(1)).optional(),
  expectedObjectQuery: z.record(z.unknown()).optional(),
  notes: z.string().min(1).optional(),
});

export const OntologySemanticsBlockSchema = z.object({
  glossary: z.array(GlossaryTermSchema).default([]),
  examples: z.array(VerifiedExampleSchema).default([]),
});

export type SemanticPropertyRole = z.infer<typeof SemanticPropertyRoleSchema>;
export type PropertySemantics = z.infer<typeof PropertySemanticsSchema>;
export type EntitySemantics = z.infer<typeof EntitySemanticsSchema>;
export type GlossaryTerm = z.infer<typeof GlossaryTermSchema>;
export type VerifiedExample = z.infer<typeof VerifiedExampleSchema>;
export type OntologySemanticsBlock = z.infer<typeof OntologySemanticsBlockSchema>;
