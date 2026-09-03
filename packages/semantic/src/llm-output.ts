/**
 * Fixed Zod schemas for the two LLM bursts. The model never invents shape:
 * generateObject validates against these, and "I don't know" (doubts) is a
 * first-class field, not an error.
 */

import { CardinalitySchema, ConfidenceSchema, PropertyRoleSchema, SemanticTypeSchema } from "@backed/core";
import { z } from "zod";

/** Burst 1 (cheap model): per-column classification and labels. */
export const ColumnClassificationOutputSchema = z.object({
  tables: z.array(
    z.object({
      table: z.string().min(1),
      columns: z.array(
        z.object({
          column: z.string().min(1),
          label: z.string().min(1),
          semanticType: SemanticTypeSchema,
          role: PropertyRoleSchema,
          confidence: ConfidenceSchema,
        }),
      ),
    }),
  ),
});

const EvidenceFieldSchema = z
  .string()
  .min(1)
  .describe("Statistical evidence supporting the inference, in English");

/** Burst 2 (frontier model): entities, relations, business rules, explicit doubts. */
export const OntologyOutputSchema = z.object({
  entities: z.array(
    z.object({
      id: z.string().min(1).describe("Stable slug, e.g. 'customer'"),
      name: z.string().min(1).describe("Singular name, e.g. 'Customer'"),
      description: z.string().min(1).describe("Description in English"),
      sourceTable: z.string().min(1),
      confidence: ConfidenceSchema,
      evidence: EvidenceFieldSchema,
    }),
  ),
  relations: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1).describe("Name in English, e.g. 'Invoice issued to Customer'"),
      fromEntity: z.string().min(1),
      toEntity: z.string().min(1),
      fromColumn: z.string().min(1),
      toColumn: z.string().min(1),
      cardinality: CardinalitySchema,
      confidence: ConfidenceSchema,
      evidence: EvidenceFieldSchema,
    }),
  ),
  rules: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      definition: z.string().min(1).describe("Business definition in English"),
      appliesTo: z.string().min(1).describe("Entity id this rule applies to"),
      column: z.string().min(1).optional(),
      confidence: ConfidenceSchema,
      evidence: EvidenceFieldSchema,
    }),
  ),
  doubts: z.array(
    z.object({
      topic: z.string().min(1),
      question: z.string().min(1).describe("The open question, in English"),
      reason: z.string().min(1).describe("Why the model cannot answer"),
    }),
  ),
});

export type ColumnClassificationOutput = z.infer<typeof ColumnClassificationOutputSchema>;
export type OntologyOutput = z.infer<typeof OntologyOutputSchema>;
