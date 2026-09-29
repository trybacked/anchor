import type { Ontology } from "@trybacked/core";
import { buildOntologyContextForTranslation } from "./ontology-context.js";

export const SEMANTIC_QUERY_PLAN_JSON_SHAPE = `{
  "reasoning": "short explanation",
  "objectQuery": {
    "entityId": "<ontology object id>",
    "joins": [{ "relationshipId": "<id>" }],
    "filters": [{ "entityId": "<optional>", "propertyId": "<or column>", "op": "eq|contains|...", "value": "..." }],
    "textSearch": { "query": "...", "entityId": "<optional>", "columns": ["..."] },
    "mode": "rows|count",
    "limit": 15
  },
  "objectSet": {
    "entityId": "<optional scope object>",
    "filters": [],
    "documentIds": ["<single doc id>"],
    "timeRange": { "column": "...", "from": "...", "to": "..." }
  }
}`;

export function buildSemanticTranslationPrompt(ontology: Ontology, question: string): string {
  const context = buildOntologyContextForTranslation(ontology);
  return [
    "You translate natural-language questions into a JSON semantic query plan for a governed ontology warehouse.",
    "Output ONLY valid JSON matching the schema below. Use object/property ids exactly as in the ontology.",
    "Prefer mode \"count\" for how-many questions. Use joins + filters on related entityId for multi-hop questions.",
    "Use op \"contains\" for substring search on string fields; op \"in\" for multiple values; op \"is_not_null\" when a field must be populated.",
    "Use aggregations + groupBy for breakdowns (e.g. count per region). For joined labels use select like \"organization.<propertyId>\" with the matching joins.",
    "Or use textSearch for OR across string columns when no single property fits.",
    "",
    "JSON schema:",
    SEMANTIC_QUERY_PLAN_JSON_SHAPE,
    "",
    "Ontology:",
    context,
    "",
    "Question:",
    question,
  ].join("\n");
}

export function buildSemanticRepairPrompt(
  question: string,
  validationError: string,
  rejectedJson: string,
): string {
  return [
    "The previous JSON plan failed ontology validation. Fix ONLY the plan JSON.",
    `Validation error: ${validationError}`,
    "Rejected plan:",
    rejectedJson,
    "",
    "Question:",
    question,
    "",
    "Output corrected JSON only.",
  ].join("\n");
}
