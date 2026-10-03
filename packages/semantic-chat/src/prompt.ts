import type { Ontology } from "@trybacked/core";
import { buildOntologyContextForTranslation } from "./ontology-context.js";
import type { PlanTemplateRegistry } from "./template-registry.js";

export const ROUTED_SEMANTIC_PLAN_JSON_SHAPE = `{
  "route": "single|template",
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
  },
  "templateId": "<when route is template>",
  "params": { "<paramName>": "<value>" }
}`;

export const SEMANTIC_QUERY_PLAN_JSON_SHAPE = ROUTED_SEMANTIC_PLAN_JSON_SHAPE;

function formatTemplateCatalog(registry: PlanTemplateRegistry): string {
  const templates = registry.list();
  if (templates.length === 0) {
    return "No plan templates available.";
  }
  return templates
    .map((template) => {
      const params = template.params
        .map((param) => `    - ${param.name} (${param.type}): ${param.description}`)
        .join("\n");
      return `- ${template.id}: ${template.description}\n  params:\n${params}`;
    })
    .join("\n");
}

export function buildSemanticTranslationPrompt(
  ontology: Ontology,
  question: string,
  templateRegistry: PlanTemplateRegistry,
): string {
  const context = buildOntologyContextForTranslation(ontology);
  return [
    "You translate natural-language questions into a JSON semantic query plan for a governed ontology warehouse.",
    "Output ONLY valid JSON matching the schema below. Use object/property ids exactly as in the ontology.",
    'Use route "single" for warehouse-only questions (counts, filters, joins, groupBy on curated objects).',
    'Use route "template" ONLY when the user asks to search archived documents / PDFs / what documents say, then relate results to ontology objects.',
    "For route template, set templateId and params only — never invent execution steps.",
    'For route "single", omit templateId and params. Omit objectSet unless the user explicitly scopes a document id or date column.',
    "Do not use textSearch when a specific property filter (eq, in, contains) is enough.",
    'mode "count" must never include textSearch (invalid plan). Whole-object totals: mode count, filters []. Scoped counts: mode count with filters only (e.g. op contains).',
    'Prefer mode "count" for how-many questions. Use joins + filters on related entityId for multi-hop questions.',
    "For groupBy breakdowns use mode rows with aggregations (e.g. count alias), not mode count.",
    "For joined columns set joins and select entries like organization.<propertyId>.",
    'Use op "contains" for substring search on string fields; op "in" for multiple values; op "is_not_null" when a field must be populated.',
    'Use aggregations + groupBy for breakdowns (e.g. count per region). For joined labels use select like "organization.<propertyId>" with the matching joins.',
    "Or use textSearch for OR across string columns when no single property fits.",
    "",
    "Available plan templates:",
    formatTemplateCatalog(templateRegistry),
    "",
    "JSON schema:",
    ROUTED_SEMANTIC_PLAN_JSON_SHAPE,
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
