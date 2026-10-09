import { z } from "zod";
import { OntologyRelationshipCardinalitySchema } from "../cardinality.js";
import { ConfidenceSchema, ElementStatusSchema } from "../model.js";
import {
  EntitySemanticsSchema,
  OntologySemanticsBlockSchema,
  PropertySemanticsSchema,
} from "../semantics.js";
import { OntologyLifecycleStageSchema } from "./lifecycle.js";
import type { Ontology } from "./spec.js";

export const ONTOLOGY_FORMAT_VERSION_V2 = "2" as const;

export const OntologyScalarTypeSchema = z.enum([
  "string",
  "integer",
  "long",
  "double",
  "decimal",
  "boolean",
  "date",
  "timestamp",
  "geopoint",
  "reference",
  "attachment",
  "json",
]);

export type OntologyScalarType = z.infer<typeof OntologyScalarTypeSchema>;

export type OntologyTypeExpr =
  | OntologyScalarType
  | { kind: "array"; items: OntologyTypeExpr }
  | {
      kind: "struct";
      fields: { name: string; type: OntologyTypeExpr; nullable?: boolean | undefined }[];
    }
  | { kind: "valueType"; valueTypeId: string };
export const OntologyTypeExprSchema: z.ZodType<OntologyTypeExpr> = z.lazy(() =>
  z.union([
    OntologyScalarTypeSchema,
    z.object({ kind: z.literal("array"), items: OntologyTypeExprSchema }),
    z.object({
      kind: z.literal("struct"),
      fields: z.array(
        z.object({
          name: z.string().min(1),
          type: OntologyTypeExprSchema,
          nullable: z.boolean().optional(),
        }),
      ),
    }),
    z.object({ kind: z.literal("valueType"), valueTypeId: z.string().min(1) }),
  ]),
);

export const OntologyValueTypeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  baseType: OntologyTypeExprSchema,
  format: z.string().min(1).optional(),
  semantics: PropertySemanticsSchema.optional(),
});

export type OntologyValueType = z.infer<typeof OntologyValueTypeSchema>;

export const DatasourceBindingSchema = z.object({
  sourceId: z.string().min(1),
  datasetId: z.string().min(1),
  columnMappings: z.record(z.string().min(1), z.string().min(1)),
  primaryKey: z.array(z.string().min(1)).optional(),
  filter: z.string().min(1).optional(),
});

export type DatasourceBinding = z.infer<typeof DatasourceBindingSchema>;

export const OntologySharedPropertySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: OntologyTypeExprSchema,
  required: z.boolean().optional(),
  semantics: PropertySemanticsSchema.optional(),
});

export type OntologySharedProperty = z.infer<typeof OntologySharedPropertySchema>;
export const OntologyInterfaceV2Schema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  sharedProperties: z.array(OntologySharedPropertySchema),
});

export type OntologyInterfaceV2 = z.infer<typeof OntologyInterfaceV2Schema>;

export const OntologyPropertyV2Schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("physical"),
    id: z.string().min(1),
    name: z.string().min(1),
    type: OntologyTypeExprSchema,
    bindingSourceId: z.string().min(1),
    column: z.string().min(1),
    role: z.enum(["primary_key", "foreign_key", "attribute"]).optional(),
    nullable: z.boolean().optional(),
    confidence: ConfidenceSchema.optional(),
    provenance: z
      .object({
        evidence: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
      })
      .optional(),
    status: ElementStatusSchema.optional(),
    lifecycle: OntologyLifecycleStageSchema.optional(),
    source: z.enum(["inferred", "manual"]).optional(),
    semantics: PropertySemanticsSchema.optional(),
  }),
  z.object({
    kind: z.literal("derived"),
    id: z.string().min(1),
    name: z.string().min(1),
    type: OntologyTypeExprSchema,
    expression: z.string().min(1),
    dependsOn: z.array(z.string().min(1)),
    nullable: z.boolean().optional(),
    semantics: PropertySemanticsSchema.optional(),
  }),
  z.object({
    kind: z.literal("shared"),
    id: z.string().min(1),
    interfaceId: z.string().min(1),
    sharedPropertyId: z.string().min(1),
    required: z.boolean().optional(),
    semantics: PropertySemanticsSchema.optional(),
  }),
]);

export type OntologyPropertyV2 = z.infer<typeof OntologyPropertyV2Schema>;

export const OntologyObjectTypeV2Schema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  implements: z.array(z.string().min(1)).optional(),
  backing: z.array(DatasourceBindingSchema),
  properties: z.array(OntologyPropertyV2Schema),
  titlePropertyId: z.string().min(1).optional(),
  confidence: ConfidenceSchema.optional(),
  provenance: z
    .object({
      evidence: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    })
    .optional(),
  status: ElementStatusSchema.optional(),
  lifecycle: OntologyLifecycleStageSchema.optional(),
  source: z.enum(["inferred", "manual"]).optional(),
  semantics: EntitySemanticsSchema.optional(),
});

export type OntologyObjectTypeV2 = z.infer<typeof OntologyObjectTypeV2Schema>;

export const OntologyLinkTypeV2Schema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fromObjectTypeId: z.string().min(1),
  toObjectTypeId: z.string().min(1),
  cardinality: OntologyRelationshipCardinalitySchema,
  keyMappings: z.array(
    z.object({ fromPropertyId: z.string().min(1), toPropertyId: z.string().min(1) }),
  ),
  confidence: ConfidenceSchema.optional(),
  provenance: z
    .object({
      evidence: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    })
    .optional(),
  status: ElementStatusSchema.optional(),
  lifecycle: OntologyLifecycleStageSchema.optional(),
  source: z.enum(["inferred", "manual"]).optional(),
  semantics: EntitySemanticsSchema.optional(),
});

export type OntologyLinkTypeV2 = z.infer<typeof OntologyLinkTypeV2Schema>;

export const OntologyActionParameterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: OntologyTypeExprSchema,
  required: z.boolean().optional(),
});
export const OntologyActionTypeV2Schema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  objectTypeId: z.string().min(1).optional(),
  parameters: z.array(OntologyActionParameterSchema).optional(),
  handler: z.object({
    type: z.string().min(1),
    config: z.record(z.string(), z.unknown()).optional(),
  }),
  validations: z.array(z.string().min(1)).optional(),
  status: ElementStatusSchema.optional(),
  lifecycle: OntologyLifecycleStageSchema.optional(),
  semantics: EntitySemanticsSchema.optional(),
});

export type OntologyActionTypeV2 = z.infer<typeof OntologyActionTypeV2Schema>;

export const OntologyMetadataV2Schema = z.object({
  formatVersion: z.literal(ONTOLOGY_FORMAT_VERSION_V2),
  id: z.string().min(1),
  version: z.number().int().positive(),
  generatedAt: z.string().datetime().optional(),
});
export const OntologyV2Schema = z.object({
  metadata: OntologyMetadataV2Schema,
  valueTypes: z.array(OntologyValueTypeSchema).default([]),
  interfaces: z.array(OntologyInterfaceV2Schema).default([]),
  objectTypes: z.array(OntologyObjectTypeV2Schema),
  linkTypes: z.array(OntologyLinkTypeV2Schema).default([]),
  actionTypes: z.array(OntologyActionTypeV2Schema).default([]),
  semantics: OntologySemanticsBlockSchema.optional(),
});

export type OntologyMetadataV2 = z.infer<typeof OntologyMetadataV2Schema>;

export type OntologyV2 = z.infer<typeof OntologyV2Schema>;

const SCALAR_MIGRATION: Record<string, OntologyScalarType> = {
  string: "string",
  integer: "integer",
  float: "double",
  decimal: "decimal",
  boolean: "boolean",
  date: "date",
  datetime: "timestamp",
  enum: "string",
  json: "json",
  reference: "reference",
};

export function migratePropertyTypeV1ToV2(type: string): OntologyTypeExpr {
  const scalar = SCALAR_MIGRATION[type];
  if (scalar !== undefined) {
    return scalar;
  }
  throw new Error(`Unknown v1 property type "${type}" during v1→v2 migration`);
}

export function migrateOntologyV1ToV2(ontology: Ontology): OntologyV2 {
  const objectTypes = ontology.objects.map((object) => {
    const backing: DatasourceBinding[] =
      object.sourceDatasetId !== undefined
        ? [{ sourceId: "primary", datasetId: object.sourceDatasetId, columnMappings: {} }]
        : [];
    const properties = object.properties.map((property) => ({
      kind: "physical" as const,
      id: property.id,
      name: property.name,
      type: migratePropertyTypeV1ToV2(property.type),
      bindingSourceId: "primary",
      column: property.id,
      role: property.role,
      nullable: property.nullable,
      confidence: property.confidence,
      provenance: property.provenance?.evidence
        ? { evidence: property.provenance.evidence }
        : undefined,
      status: property.status,
      lifecycle: property.lifecycle,
      source: property.source,
      semantics: property.semantics,
    }));
    return {
      id: object.id,
      name: object.name,
      description: object.description,
      backing,
      properties,
      confidence: object.confidence,
      provenance: object.provenance?.evidence
        ? { evidence: object.provenance.evidence }
        : undefined,
      status: object.status,
      lifecycle: object.lifecycle,
      source: object.source,
      semantics: object.semantics,
    };
  });
  const linkTypes = ontology.relationships.map((relationship) => ({
    id: relationship.id,
    name: relationship.name,
    fromObjectTypeId: relationship.fromObjectId,
    toObjectTypeId: relationship.toObjectId,
    cardinality: relationship.cardinality,
    keyMappings: [
      ...(relationship.fromPropertyId !== undefined && relationship.toPropertyId !== undefined
        ? [
            {
              fromPropertyId: relationship.fromPropertyId,
              toPropertyId: relationship.toPropertyId,
            },
          ]
        : []),
    ],
    confidence: relationship.confidence,
    provenance: relationship.provenance?.evidence
      ? { evidence: relationship.provenance.evidence }
      : undefined,
    status: relationship.status,
    lifecycle: relationship.lifecycle,
    source: relationship.source,
  }));
  return {
    metadata: {
      formatVersion: ONTOLOGY_FORMAT_VERSION_V2,
      id: ontology.metadata.id,
      version: ontology.metadata.version,
      generatedAt: ontology.metadata.generatedAt,
    },
    valueTypes: [],
    interfaces: [],
    objectTypes,
    linkTypes,
    actionTypes: [],
    semantics: ontology.semantics,
  };
}
