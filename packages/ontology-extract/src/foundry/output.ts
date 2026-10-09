import { z } from "zod";
import { FOUNDRY_EXTRACT_OBJECT_TYPE_IDS } from "./spec.js";

const ObjectTypeIdSchema = z.enum(FOUNDRY_EXTRACT_OBJECT_TYPE_IDS);

export const FoundryExtractInstanceSchema = z.object({
  objectTypeId: ObjectTypeIdSchema,
  name: z.string().min(1),
  normalizedName: z.string().min(1).optional(),
  sourceFiles: z.array(z.string().min(1)).min(1),
  evidence: z.string().min(1),
});

export const FoundryExtractLinkTypeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fromType: ObjectTypeIdSchema,
  toType: ObjectTypeIdSchema,
  example: z
    .object({
      fromName: z.string().min(1),
      toName: z.string().min(1),
    })
    .optional(),
});

export const FoundryExtractOutputSchema = z.object({
  locale: z.string().min(2).max(8).default("it"),
  instances: z.array(FoundryExtractInstanceSchema),
  linkTypes: z.array(FoundryExtractLinkTypeSchema).optional(),
  doubts: z
    .array(
      z.object({
        topic: z.string().min(1),
        question: z.string().min(1),
        reason: z.string().min(1),
      }),
    )
    .optional(),
});

export type FoundryExtractOutput = z.infer<typeof FoundryExtractOutputSchema>;

export class FoundryExtractOutputError extends Error {
  constructor(
    message: string,
    readonly text: string,
  ) {
    super(message);
    this.name = "FoundryExtractOutputError";
  }
}

function stripCodeFence(text: string): string {
  return text.replace(/^\s*```[a-z]*\s*/i, "").replace(/\s*```\s*$/, "");
}

export function parseFoundryExtractOutput(text: string): FoundryExtractOutput {
  const trimmed = stripCodeFence(text.trim());
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new FoundryExtractOutputError("Foundry extract output is not valid JSON", text);
  }
  const result = FoundryExtractOutputSchema.safeParse(parsed);
  if (!result.success) {
    throw new FoundryExtractOutputError(
      `Foundry extract output failed schema validation: ${result.error.message}`,
      text,
    );
  }
  return result.data;
}

export const FOUNDRY_EXTRACT_OUTPUT_CONTRACT = [
  "Output: a single JSON object only (no Markdown fence, no prose).",
  `instances[]: objectTypeId must be one of: ${FOUNDRY_EXTRACT_OBJECT_TYPE_IDS.join(", ")}.`,
  "Each PDF must appear as a document instance; NATO/UN/etc. are organization instances, not types.",
  "Topics are thematic labels (artillery, cyber warfare), not duplicate document titles as types.",
  "Optional linkTypes[] with fromType/toType from the same allowed set.",
  "Optional doubts[] for human review (Ontology 101 / competency gaps).",
  "Every instance needs sourceFiles[] and a short evidence quote or note.",
].join("\n");
