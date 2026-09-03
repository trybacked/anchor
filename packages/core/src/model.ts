/**
 * Zod schema of modello.yaml — the Anchor model artifact. See README.md.
 * Every inferred element carries confidence (0..1) and provenance.
 */

import { z } from "zod";

import { MODEL_FORMAT_VERSION } from "./constants.js";

export const ConfidenceSchema = z.number().min(0).max(1);

export const ProvenanceSchema = z.object({
  table: z.string().min(1),
  column: z.string().min(1).optional(),
  // Human-readable summary of the statistical evidence behind the inference.
  evidence: z.string().min(1),
});

export const SemanticTypeSchema = z.enum([
  "text",
  "number",
  "amount",
  "date",
  "boolean",
  "identifier",
  "email",
  "vat_number",
  "fiscal_code",
  "category",
]);

export const PropertyRoleSchema = z.enum(["primary_key", "foreign_key", "attribute"]);

export const ElementStatusSchema = z.enum(["proposed", "confirmed", "renamed"]);

export const PropertySchema = z.object({
  name: z.string().min(1),
  columnName: z.string().min(1),
  semanticType: SemanticTypeSchema,
  role: PropertyRoleSchema,
  nullable: z.boolean(),
  confidence: ConfidenceSchema,
  provenance: ProvenanceSchema,
});

export const EntitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  sourceTable: z.string().min(1),
  status: ElementStatusSchema,
  confidence: ConfidenceSchema,
  provenance: ProvenanceSchema,
  properties: z.array(PropertySchema),
});

export const CardinalitySchema = z.enum(["one_to_one", "one_to_many", "many_to_many"]);

export const RelationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fromEntity: z.string().min(1),
  toEntity: z.string().min(1),
  fromColumn: z.string().min(1),
  toColumn: z.string().min(1),
  cardinality: CardinalitySchema,
  status: ElementStatusSchema,
  confidence: ConfidenceSchema,
  provenance: ProvenanceSchema,
});

export const RuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  // Business definition in Italian — the copy the SME owner reads and confirms.
  definition: z.string().min(1),
  appliesTo: z.string().min(1),
  column: z.string().min(1).optional(),
  status: ElementStatusSchema,
  confidence: ConfidenceSchema,
  provenance: ProvenanceSchema,
});

export const ModelMetadataSchema = z.object({
  formatVersion: z.literal(MODEL_FORMAT_VERSION),
  runId: z.string().min(1),
  generatedAt: z.string().datetime(),
  sourceDir: z.string().optional(),
});

export const SemanticModelSchema = z.object({
  metadata: ModelMetadataSchema,
  entities: z.array(EntitySchema),
  relations: z.array(RelationSchema),
  rules: z.array(RuleSchema),
  // Reserved for phase 2/3 writeback — field exists, implementation does not.
  actions: z.array(z.unknown()).default([]),
});

export type Confidence = z.infer<typeof ConfidenceSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type SemanticType = z.infer<typeof SemanticTypeSchema>;
export type PropertyRole = z.infer<typeof PropertyRoleSchema>;
export type ElementStatus = z.infer<typeof ElementStatusSchema>;
export type Property = z.infer<typeof PropertySchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type Cardinality = z.infer<typeof CardinalitySchema>;
export type Relation = z.infer<typeof RelationSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type ModelMetadata = z.infer<typeof ModelMetadataSchema>;
export type SemanticModel = z.infer<typeof SemanticModelSchema>;
