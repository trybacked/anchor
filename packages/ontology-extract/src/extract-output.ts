import {
  CardinalitySchema,
  DoubtSchema,
  EntitySemanticsSchema,
  GlossaryTermSchema,
  PropertyRoleSchema,
  PropertySemanticsSchema,
  SemanticTypeSchema,
} from "@trybacked/core";
import { z } from "zod";

export const OntologyExtractEntityPatchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  semantics: EntitySemanticsSchema.optional(),
  properties: z
    .array(
      z.object({
        columnName: z.string().min(1),
        name: z.string().min(1).optional(),
        semanticType: SemanticTypeSchema.optional(),
        role: PropertyRoleSchema.optional(),
        confidence: z.number().min(0).max(1).optional(),
        semantics: PropertySemanticsSchema.optional(),
      }),
    )
    .optional(),
});

export const OntologyExtractRelationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fromEntity: z.string().min(1),
  toEntity: z.string().min(1),
  fromColumn: z.string().min(1),
  toColumn: z.string().min(1),
  cardinality: CardinalitySchema,
  confidence: z.number().min(0).max(1).optional(),
  rationale: z.string().min(1).optional(),
});

export const OntologyExtractOutputSchema = z.object({
  locale: z.string().min(2).max(8),
  entities: z.array(OntologyExtractEntityPatchSchema),
  relations: z.array(OntologyExtractRelationSchema).optional(),
  glossary: z.array(GlossaryTermSchema).optional(),
  doubts: z.array(DoubtSchema).optional(),
});

export type OntologyExtractOutput = z.infer<typeof OntologyExtractOutputSchema>;

export class OntologyExtractOutputError extends Error {
  constructor(
    message: string,
    readonly text: string,
  ) {
    super(message);
    this.name = "OntologyExtractOutputError";
  }
}

export const ONTOLOGY_EXTRACT_OUTPUT_CONTRACT = [
  "Output: a single JSON object and nothing else (no prose, no Markdown fence).",
  "Keys: locale (BCP-47, e.g. it), entities (array), optional relations, glossary, doubts.",
  "entities[]: id must match a baseline entity id; optional name, description, confidence (0-1), semantics (synonyms, displayProperties, labels: per locale either a string or {singular, plural}), properties[] with columnName matching warehouse columns.",
  "properties[]: optional name, semanticType (text|number|amount|date|boolean|identifier|email|vat_number|fiscal_code|category), role (primary_key|foreign_key|attribute), confidence, semantics (description, synonyms, labels keyed by locale).",
  "relations[]: only when strongly supported by columns/samples; id, name, fromEntity, toEntity, fromColumn, toColumn, cardinality (one_to_one|one_to_many|many_to_many).",
  "glossary[]: id, term, definition, optional objectId/propertyId.",
  "doubts[]: topic, question, reason — open questions for human review.",
  "Do not invent entity ids or column names not present in the grounding payload.",
].join("\n");

function stripCodeFence(text: string): string {
  return text.replace(/^\s*```[a-z]*\s*/i, "").replace(/\s*```\s*$/, "");
}

function normalizeEntityDisplayLabels(labels: unknown): Record<string, unknown> | undefined {
  if (typeof labels !== "object" || labels === null) {
    return undefined;
  }
  const normalizedLabels: Record<string, unknown> = {};
  for (const [language, label] of Object.entries(labels)) {
    if (typeof label === "string") {
      normalizedLabels[language] = { singular: label, plural: label };
    } else {
      normalizedLabels[language] = label;
    }
  }
  return normalizedLabels;
}

function normalizePropertyDisplayLabels(labels: unknown): Record<string, unknown> | undefined {
  if (typeof labels !== "object" || labels === null) {
    return undefined;
  }
  const normalizedLabels: Record<string, unknown> = {};
  for (const [language, label] of Object.entries(labels)) {
    if (typeof label === "string") {
      normalizedLabels[language] = label;
      continue;
    }
    if (typeof label === "object" && label !== null && "singular" in label) {
      const singular = (label as { singular?: unknown }).singular;
      if (typeof singular === "string") {
        normalizedLabels[language] = singular;
        continue;
      }
    }
    normalizedLabels[language] = JSON.stringify(label);
  }
  return normalizedLabels;
}

function normalizeExtractJson(json: unknown): unknown {
  if (typeof json !== "object" || json === null) {
    return json;
  }
  const root = json as Record<string, unknown>;
  const rawEntities = root["entities"];
  if (!Array.isArray(rawEntities)) {
    return json;
  }
  const entities = rawEntities.map((entry: unknown): unknown => {
    if (typeof entry !== "object" || entry === null) {
      return entry;
    }
    const entity = entry as Record<string, unknown>;
    let nextEntity: unknown = entry;
    const entitySemantics = entity["semantics"];
    if (typeof entitySemantics === "object" && entitySemantics !== null) {
      const semanticsRecord = entitySemantics as Record<string, unknown>;
      const entityLabels = normalizeEntityDisplayLabels(semanticsRecord["labels"]);
      if (entityLabels !== undefined) {
        nextEntity = {
          ...entity,
          semantics: { ...semanticsRecord, labels: entityLabels },
        };
      }
    }
    const properties = entity["properties"];
    if (!Array.isArray(properties)) {
      return nextEntity;
    }
    const normalizedProperties = properties.map((property: unknown): unknown => {
      if (typeof property !== "object" || property === null) {
        return property;
      }
      const propertyRecord = property as Record<string, unknown>;
      const propertySemantics = propertyRecord["semantics"];
      if (typeof propertySemantics !== "object" || propertySemantics === null) {
        return property;
      }
      const semanticsRecord = propertySemantics as Record<string, unknown>;
      const propertyLabels = normalizePropertyDisplayLabels(semanticsRecord["labels"]);
      if (propertyLabels === undefined) {
        return property;
      }
      return {
        ...propertyRecord,
        semantics: { ...semanticsRecord, labels: propertyLabels },
      };
    });
    return { ...(nextEntity as Record<string, unknown>), properties: normalizedProperties };
  });
  return { ...root, entities };
}

export function parseOntologyExtractOutput(text: string): OntologyExtractOutput {
  const body = stripCodeFence(text);
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new OntologyExtractOutputError("Extract model returned no JSON object.", text);
  }
  let json: unknown;
  try {
    json = JSON.parse(body.slice(start, end + 1));
  } catch (error) {
    throw new OntologyExtractOutputError(
      `Extract JSON is invalid: ${error instanceof Error ? error.message : String(error)}`,
      text,
    );
  }
  const parsed = OntologyExtractOutputSchema.safeParse(normalizeExtractJson(json));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".") ?? "";
    throw new OntologyExtractOutputError(
      `Extract output does not match the contract${path ? ` at ${path}` : ""}: ${issue?.message ?? "invalid"}`,
      text,
    );
  }
  return parsed.data;
}
