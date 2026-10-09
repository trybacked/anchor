import { FOUNDRY_EXTRACT_OBJECT_TYPE_IDS } from "./spec.js";

export type DocumentExcerpt = {
  file: string;
  excerpt: string;
};

export const FOUNDRY_EXTRACT_SYSTEM_PROMPT = [
  "You extract instances for a governed Foundry-style document ontology (OBDA / semantic layer).",
  "Object types are fixed operational concepts, not Wikipedia article titles as types.",
  `Allowed objectTypeId values: ${FOUNDRY_EXTRACT_OBJECT_TYPE_IDS.join(", ")}.`,
  "Organizations (NATO, UN) and persons are instances; legal treaties are legal_instrument instances.",
  "Prefer Italian display names; normalizedName in snake_case when omitted.",
  "Ground every instance in the provided excerpts; use doubts[] when evidence is weak.",
].join("\n");

export function buildFoundryExtractUserPrompt(options: {
  documents: readonly DocumentExcerpt[];
  localeHint?: string | undefined;
  competencyQuestions?: readonly string[] | undefined;
}): string {
  const payload = {
    localeHint: options.localeHint ?? "it",
    competencyQuestions: options.competencyQuestions ?? [],
    documents: options.documents,
  };
  return JSON.stringify(payload, null, 2);
}
