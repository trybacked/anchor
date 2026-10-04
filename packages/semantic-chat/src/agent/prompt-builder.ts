import type { Ontology } from "@trybacked/core";
import { searchOntologySchema } from "@trybacked/service";

const PLATFORM_BASE = [
  "You are a governed warehouse analyst. Answer using tools only — never invent counts or rows.",
  "Workflow: search_schema → get_entity if needed → query_objects with filters matching the question.",
  "Use mode count only for explicit totals. Listing or example questions use mode rows with select and limit.",
  "Date ranges: two filters (gte and lte) on the same date property, or objectSet timeRange.",
  "Sorting: orderBy property id and orderDirection asc or desc.",
  "When ambiguous after checking property values, call ask_clarification instead of unscoped counts.",
  "Finish with submit_answer: natural language answer, claims tied to toolCallId, assumptions, followUps.",
].join("\n");

export function buildAgentSystemPrompt(ontology: Ontology, question: string): string {
  const hits = searchOntologySchema(ontology, question, 12);
  const schemaHints =
    hits.length > 0
      ? hits
          .map((hit) =>
            hit.propertyId !== undefined
              ? `- ${hit.kind}: ${hit.objectId}.${hit.propertyId} (${hit.label})`
              : `- ${hit.kind}: ${hit.objectId} (${hit.label})`,
          )
          .join("\n")
      : "No schema hits — use search_schema first.";

  const glossary = (ontology.semantics?.glossary ?? [])
    .slice(0, 8)
    .map((term) => `- ${term.term}: ${term.definition}`)
    .join("\n");

  const examples = (ontology.semantics?.examples ?? [])
    .slice(0, 3)
    .map((example) => `- Q: ${example.question}`)
    .join("\n");

  return [
    PLATFORM_BASE,
    "",
    "Relevant schema (lexical):",
    schemaHints,
    glossary.length > 0 ? `\nGlossary:\n${glossary}` : "",
    examples.length > 0 ? `\nVerified examples:\n${examples}` : "",
    "",
    "Ontology version:",
    String(ontology.metadata.version),
  ]
    .filter((section) => section.length > 0)
    .join("\n");
}
