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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isObjectTypeId(value: unknown): value is z.infer<typeof ObjectTypeIdSchema> {
  return (
    typeof value === "string" &&
    (FOUNDRY_EXTRACT_OBJECT_TYPE_IDS as readonly string[]).includes(value)
  );
}

function normalizeLinkTypeEntry(entry: unknown): z.infer<typeof FoundryExtractLinkTypeSchema> | null {
  if (!isRecord(entry)) {
    return null;
  }
  const fromType = entry.fromType ?? entry.from_type;
  const toType = entry.toType ?? entry.to_type;
  if (!isObjectTypeId(fromType) || !isObjectTypeId(toType)) {
    return null;
  }
  const id =
    nonEmptyString(entry.id) ??
    nonEmptyString(entry.linkTypeId) ??
    `${fromType}_to_${toType}`.slice(0, 80);
  const name = nonEmptyString(entry.name) ?? nonEmptyString(entry.label) ?? id;
  const exampleRaw = entry.example;
  let example: { fromName: string; toName: string } | undefined;
  if (isRecord(exampleRaw)) {
    const fromName = nonEmptyString(exampleRaw.fromName ?? exampleRaw.from);
    const toName = nonEmptyString(exampleRaw.toName ?? exampleRaw.to);
    if (fromName !== undefined && toName !== undefined) {
      example = { fromName, toName };
    }
  }
  return {
    id,
    name,
    fromType,
    toType,
    ...(example !== undefined ? { example } : {}),
  };
}

function normalizeDoubtEntry(
  entry: unknown,
): { topic: string; question: string; reason: string } | null {
  if (!isRecord(entry)) {
    return null;
  }
  const topic = nonEmptyString(entry.topic ?? entry.subject ?? entry.area);
  const question = nonEmptyString(entry.question ?? entry.prompt ?? entry.text);
  const reason =
    nonEmptyString(entry.reason ?? entry.rationale ?? entry.note) ??
    "Segnalato dall'estrattore per revisione umana.";
  if (topic === undefined || question === undefined) {
    return null;
  }
  return { topic, question, reason };
}

/** Drop or repair optional arrays LLMs often emit with partial objects. */
export function sanitizeFoundryExtractPayload(parsed: unknown): unknown {
  if (!isRecord(parsed)) {
    return parsed;
  }
  const linkTypesRaw = parsed.linkTypes ?? parsed.link_types;
  const doubtsRaw = parsed.doubts;
  const linkTypes = Array.isArray(linkTypesRaw)
    ? linkTypesRaw.flatMap((entry) => {
        const normalized = normalizeLinkTypeEntry(entry);
        return normalized !== null ? [normalized] : [];
      })
    : undefined;
  const doubts = Array.isArray(doubtsRaw)
    ? doubtsRaw.flatMap((entry) => {
        const normalized = normalizeDoubtEntry(entry);
        return normalized !== null ? [normalized] : [];
      })
    : undefined;
  return {
    ...parsed,
    ...(linkTypes !== undefined ? { linkTypes } : {}),
    ...(doubts !== undefined ? { doubts } : {}),
  };
}

export function parseFoundryExtractOutput(text: string): FoundryExtractOutput {
  const trimmed = stripCodeFence(text.trim());
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new FoundryExtractOutputError("Foundry extract output is not valid JSON", text);
  }
  const result = FoundryExtractOutputSchema.safeParse(sanitizeFoundryExtractPayload(parsed));
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
