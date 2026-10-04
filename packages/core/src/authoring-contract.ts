import { z } from "zod";
import {
  CardinalitySchema,
  EntitySchema,
  PropertySchema,
  RelationSchema,
  RuleSchema,
  SemanticModelSchema,
} from "./model.js";
import {
  EntitySemanticsSchema,
  GlossaryTermSchema,
  PropertySemanticsSchema,
  VerifiedExampleSchema,
} from "./semantics.js";

export const TenantRoleSchema = z.enum(["viewer", "editor", "publisher", "admin"]);
export type TenantRole = z.infer<typeof TenantRoleSchema>;

export const AuthoringCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("addEntity"), entity: EntitySchema }),
  z.object({
    type: z.literal("updateEntity"),
    entityId: z.string().min(1),
    patch: z
      .object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        sourceTable: z.string().min(1).optional(),
        status: z.enum(["proposed", "confirmed", "renamed"]).optional(),
        confidence: z.number().min(0).max(1).optional(),
      })
      .strict(),
  }),
  z.object({ type: z.literal("removeEntity"), entityId: z.string().min(1) }),
  z.object({
    type: z.literal("addProperty"),
    entityId: z.string().min(1),
    property: PropertySchema,
  }),
  z.object({
    type: z.literal("updateProperty"),
    entityId: z.string().min(1),
    columnName: z.string().min(1),
    patch: z
      .object({
        name: z.string().min(1).optional(),
        columnName: z.string().min(1).optional(),
        semanticType: PropertySchema.shape.semanticType.optional(),
        role: PropertySchema.shape.role.optional(),
        nullable: z.boolean().optional(),
        confidence: z.number().min(0).max(1).optional(),
      })
      .strict(),
  }),
  z.object({
    type: z.literal("removeProperty"),
    entityId: z.string().min(1),
    columnName: z.string().min(1),
  }),
  z.object({ type: z.literal("addRelation"), relation: RelationSchema }),
  z.object({
    type: z.literal("updateRelation"),
    relationId: z.string().min(1),
    patch: z
      .object({
        name: z.string().min(1).optional(),
        fromColumn: z.string().min(1).optional(),
        toColumn: z.string().min(1).optional(),
        cardinality: CardinalitySchema.optional(),
        status: z.enum(["proposed", "confirmed", "renamed"]).optional(),
      })
      .strict(),
  }),
  z.object({ type: z.literal("removeRelation"), relationId: z.string().min(1) }),
  z.object({ type: z.literal("addRule"), rule: RuleSchema }),
  z.object({
    type: z.literal("updateRule"),
    ruleId: z.string().min(1),
    patch: z
      .object({
        name: z.string().min(1).optional(),
        definition: z.string().min(1).optional(),
        appliesTo: z.string().min(1).optional(),
        column: z.string().min(1).optional(),
        status: z.enum(["proposed", "confirmed", "renamed"]).optional(),
      })
      .strict(),
  }),
  z.object({ type: z.literal("removeRule"), ruleId: z.string().min(1) }),
  z.object({
    type: z.literal("applyPack"),
    packId: z.string().min(1),
    catalog: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal("setPropertySemantics"),
    entityId: z.string().min(1),
    columnName: z.string().min(1),
    semantics: PropertySemanticsSchema,
  }),
  z.object({
    type: z.literal("setEntitySemantics"),
    entityId: z.string().min(1),
    semantics: EntitySemanticsSchema,
  }),
  z.object({
    type: z.literal("upsertGlossaryTerm"),
    term: GlossaryTermSchema,
  }),
  z.object({
    type: z.literal("removeGlossaryTerm"),
    termId: z.string().min(1),
  }),
  z.object({
    type: z.literal("upsertExample"),
    example: VerifiedExampleSchema,
  }),
  z.object({
    type: z.literal("removeExample"),
    exampleId: z.string().min(1),
  }),
]);

export type AuthoringCommand = z.infer<typeof AuthoringCommandSchema>;

export const ApplyCommandsBodySchema = z.object({
  commands: z.array(AuthoringCommandSchema).min(1).max(100),
});

export const OntologyDraftResponseSchema = z.object({
  revision: z.number().int().nonnegative(),
  basedOnVersion: z.number().int().nonnegative().nullable(),
  model: SemanticModelSchema,
  updatedBy: z.string().min(1).nullable(),
  updatedAt: z.string().datetime(),
});

export const ApplyCommandsResponseSchema = z.object({
  revision: z.number().int().nonnegative(),
  model: SemanticModelSchema,
  validation: z.object({
    valid: z.boolean(),
    issues: z.array(
      z.object({
        code: z.string(),
        severity: z.enum(["error", "warning"]),
        message: z.string(),
        path: z.string().optional(),
      }),
    ),
  }),
});

export const PublishOntologyBodySchema = z.object({
  notes: z.string().max(2000).optional(),
});

export const PublishOntologyResponseSchema = z.object({
  jobId: z.string().uuid(),
});

export const OntologyVersionSummarySchema = z.object({
  version: z.number().int().positive(),
  publishedAt: z.string().datetime(),
  publishedBy: z.string().min(1).nullable(),
  notes: z.string().nullable(),
});

export const OntologyVersionDetailSchema = OntologyVersionSummarySchema.extend({
  model: SemanticModelSchema,
});

export const OntologyChangeRecordSchema = z.object({
  revision: z.number().int().nonnegative(),
  command: AuthoringCommandSchema,
  actor: z.string().min(1),
  createdAt: z.string().datetime(),
});

export const OntologyPackSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
});
export type OntologyPackSummary = z.infer<typeof OntologyPackSummarySchema>;

export const ImportOntologyBodySchema = z.object({
  format: z.enum(["yaml", "json"]),
  content: z.string().min(1),
});

export const TenantRoleBindingSchema = z.object({
  subjectType: z.enum(["user", "workos_role"]),
  subject: z.string().min(1),
  role: TenantRoleSchema,
});

export const PutMemberBodySchema = TenantRoleBindingSchema;

export const AuthoringJobSchema = z.object({
  id: z.string().uuid(),
  kind: z.string().min(1),
  status: z.enum(["pending", "running", "completed", "failed"]),
  error: z.string().nullable(),
  result: z.record(z.unknown()).nullable(),
});

export const AuthoringDiffChangeSchema = z.object({
  kind: z.enum(["added", "changed", "removed", "breaking"]),
  subject: z.string().min(1),
  detail: z.string().min(1),
});

export const AuthoringDiffResponseSchema = z.object({
  changes: z.array(AuthoringDiffChangeSchema),
});

export const WarehouseTableSchema = z.object({
  catalog: z.string(),
  schema: z.string(),
  name: z.string(),
  fqn: z.string(),
});

export const WarehouseColumnSchema = z.object({
  name: z.string(),
  dataType: z.string(),
  nullable: z.boolean(),
});

export const DerivedDatasetSchema = z.object({
  name: z.string().min(1),
  schema: z.string().min(1),
  sql: z.string().min(1),
  status: z.enum(["pending", "active", "failed"]),
  lastError: z.string().nullable(),
  createdBy: z.string().nullable(),
});

export const CreateDerivedDatasetBodySchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/),
  sql: z.string().min(1).max(32_000),
});
