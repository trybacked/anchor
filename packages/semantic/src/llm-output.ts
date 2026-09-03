/**
 * Fixed Zod schemas for the two LLM bursts. The model never invents shape:
 * generateObject validates against these, and "I don't know" (doubts) is a
 * first-class field, not an error.
 */

import { CardinalitySchema, ConfidenceSchema, PropertyRoleSchema, SemanticTypeSchema } from "@backed/core";
import { z } from "zod";

/** Burst 1 (cheap model): per-column classification and Italian labels. */
export const ColumnClassificationOutputSchema = z.object({
  tables: z.array(
    z.object({
      table: z.string().min(1),
      columns: z.array(
        z.object({
          column: z.string().min(1),
          // Italian human-readable label, e.g. "Partita IVA".
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
  .describe("Evidenza statistica che sostiene l'inferenza, in italiano");

/** Burst 2 (frontier model): entities, relations, business rules, explicit doubts. */
export const OntologyOutputSchema = z.object({
  entities: z.array(
    z.object({
      id: z.string().min(1).describe("Slug stabile, es. 'cliente'"),
      name: z.string().min(1).describe("Nome italiano singolare, es. 'Cliente'"),
      description: z.string().min(1).describe("Descrizione in italiano"),
      sourceTable: z.string().min(1),
      confidence: ConfidenceSchema,
      evidence: EvidenceFieldSchema,
    }),
  ),
  relations: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1).describe("Nome italiano, es. 'Fattura emessa a Cliente'"),
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
      definition: z.string().min(1).describe("Definizione di business in italiano"),
      appliesTo: z.string().min(1).describe("Id dell'entità a cui si applica"),
      column: z.string().min(1).optional(),
      confidence: ConfidenceSchema,
      evidence: EvidenceFieldSchema,
    }),
  ),
  doubts: z.array(
    z.object({
      topic: z.string().min(1),
      question: z.string().min(1).describe("La domanda aperta, in italiano"),
      reason: z.string().min(1).describe("Perché il modello non sa rispondere"),
    }),
  ),
});

export type ColumnClassificationOutput = z.infer<typeof ColumnClassificationOutputSchema>;
export type OntologyOutput = z.infer<typeof OntologyOutputSchema>;
