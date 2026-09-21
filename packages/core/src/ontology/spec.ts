/** Canonical ontology specification (provider-independent). Complements model.yaml v1. */
import { z } from "zod";
import { ConfidenceSchema, ElementStatusSchema } from "../model.js";
import { OntologyLifecycleStageSchema } from "./lifecycle.js";

export const ONTOLOGY_FORMAT_VERSION = "1" as const;

export const OntologyPropertyTypeSchema = z.enum([
  "string",
  "integer",
  "float",
  "decimal",
  "boolean",
  "date",
  "datetime",
  "enum",
  "json",
  "reference",
]);

export const OntologyPropertyRoleSchema = z.enum(["primary_key", "foreign_key", "attribute"]);

export const OntologyProvenanceSchema = z.object({
  type: z.string().min(1).optional(),
  table: z.string().min(1).optional(),
  column: z.string().min(1).optional(),
  evidence: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  sourceDatasets: z.array(z.string().min(1)).optional(),
});

export const OntologyPropertySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: OntologyPropertyTypeSchema,
  role: OntologyPropertyRoleSchema.optional(),
  nullable: z.boolean().optional(),
  enumValues: z.array(z.string().min(1)).optional(),
  referenceObjectId: z.string().min(1).optional(),
  confidence: ConfidenceSchema.optional(),
  provenance: OntologyProvenanceSchema.optional(),
  status: ElementStatusSchema.optional(),
  lifecycle: OntologyLifecycleStageSchema.optional(),
  source: z.enum(["inferred", "manual"]).optional(),
});

export const OntologyObjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  sourceDatasetId: z.string().min(1).optional(),
  properties: z.array(OntologyPropertySchema),
  confidence: ConfidenceSchema.optional(),
  provenance: OntologyProvenanceSchema.optional(),
  status: ElementStatusSchema.optional(),
  lifecycle: OntologyLifecycleStageSchema.optional(),
  source: z.enum(["inferred", "manual"]).optional(),
});

export const OntologyRelationshipCardinalitySchema = z.enum([
  "one_to_one",
  "one_to_many",
  "many_to_one",
  "many_to_many",
]);

export const OntologyRelationshipSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fromObjectId: z.string().min(1),
  toObjectId: z.string().min(1),
  fromPropertyId: z.string().min(1).optional(),
  toPropertyId: z.string().min(1).optional(),
  cardinality: OntologyRelationshipCardinalitySchema,
  confidence: ConfidenceSchema.optional(),
  provenance: OntologyProvenanceSchema.optional(),
  status: ElementStatusSchema.optional(),
  lifecycle: OntologyLifecycleStageSchema.optional(),
  source: z.enum(["inferred", "manual"]).optional(),
});

export const OntologyLogicSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  objectId: z.string().min(1),
  expression: z.string().min(1),
  confidence: ConfidenceSchema.optional(),
  provenance: OntologyProvenanceSchema.optional(),
  status: ElementStatusSchema.optional(),
  lifecycle: OntologyLifecycleStageSchema.optional(),
  source: z.enum(["inferred", "manual"]).optional(),
});

export const OntologyActionInputSchema = z.record(
  z.string().min(1),
  z.object({
    type: OntologyPropertyTypeSchema,
    required: z.boolean().optional(),
  }),
);

export const OntologyActionHandlerSchema = z.object({
  type: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const OntologyActionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  objectId: z.string().min(1),
  inputs: OntologyActionInputSchema.optional(),
  handler: OntologyActionHandlerSchema,
  confidence: ConfidenceSchema.optional(),
  provenance: OntologyProvenanceSchema.optional(),
  status: ElementStatusSchema.optional(),
  lifecycle: OntologyLifecycleStageSchema.optional(),
  source: z.enum(["inferred", "manual"]).optional(),
});

export const OntologyMetadataSchema = z.object({
  formatVersion: z.literal(ONTOLOGY_FORMAT_VERSION),
  id: z.string().min(1),
  version: z.number().int().positive(),
  generatedAt: z.string().datetime().optional(),
});

export const OntologySchema = z.object({
  metadata: OntologyMetadataSchema,
  objects: z.array(OntologyObjectSchema),
  relationships: z.array(OntologyRelationshipSchema),
  logic: z.array(OntologyLogicSchema).default([]),
  actions: z.array(OntologyActionSchema).default([]),
});

export type OntologyPropertyType = z.infer<typeof OntologyPropertyTypeSchema>;
export type OntologyPropertyRole = z.infer<typeof OntologyPropertyRoleSchema>;
export type OntologyProvenance = z.infer<typeof OntologyProvenanceSchema>;
export type OntologyProperty = z.infer<typeof OntologyPropertySchema>;
export type OntologyObject = z.infer<typeof OntologyObjectSchema>;
export type OntologyRelationshipCardinality = z.infer<typeof OntologyRelationshipCardinalitySchema>;
export type OntologyRelationship = z.infer<typeof OntologyRelationshipSchema>;
export type OntologyLogic = z.infer<typeof OntologyLogicSchema>;
export type OntologyAction = z.infer<typeof OntologyActionSchema>;
export type OntologyMetadata = z.infer<typeof OntologyMetadataSchema>;
export type Ontology = z.infer<typeof OntologySchema>;
