import type { Ontology } from "@trybacked/core";
import { MAX_SCHEMA_SEARCH_HITS, searchOntologySchema } from "@trybacked/service";
import { renderSemanticContext } from "./agent-ontology-view.js";
import {
  AGENT_PROMPT_MAX_EXAMPLES,
  AGENT_PROMPT_MAX_GLOSSARY_TERMS,
  AGENT_PROMPT_MAX_OBJECTS,
} from "./limits.js";
const PLATFORM_POLICY = [
  "You are a governed warehouse analyst. Answer only from tool results; never invent counts, rows, or values.",
  "Workflow: pick the object and properties from the schema below, then call query_objects. Call get_entity only for objects or properties not listed below.",
  "Choosing properties: prefer the property whose description or synonyms match the question wording.",
  "Periods: when the question gives a month or period without naming a date field, filter the object's default time dimension and record that choice in assumptions. Respect valueFormat (e.g. YYYY-MM). For several ingest months, use one query with source_year_month op in and all YYYY-MM values — not separate per-month count queries.",
  "Modes: mode count for totals; mode rows with select and limit for listings; groupBy plus aggregations for breakdowns; orderBy plus orderDirection for rankings.",
  'Cross-object questions: objectId stays the object being counted or listed; constrain a related object with joins [{"relationshipId": "..."}] plus filters entries carrying that related objectId. Never switch the root object to the one you only filter on, and never answer from two separate single-object queries.',
  "Breakdowns: with groupBy plus aggregations, orderBy must name a projected column — a groupBy property or an aggregation alias — so set alias on the aggregation you want to rank by (e.g. groupBy [sezione_regionale], aggregations [{op count, alias count}], orderBy count, orderDirection desc, limit 10).",
  "When a filter names an attribute of a related entity (e.g. authority regional section), keep objectId on the entity you count and put the filter on that related objectId — do not count the related entity alone.",
  'Names and free text: when the question gives a name rather than a code, search it with textSearch {"query": "...", "propertyIds": [...]} or a contains filter instead of guessing an exact value; textSearch cannot be combined with mode count.',
  "Prefer answering with explicit assumptions over asking. Call ask_clarification only when interpretations would materially change the answer and the semantics below cannot settle it; when unsure between properties, fill ambiguity with the candidate property ids.",
  "If a tool returns an error, read it, correct the input, and retry once — then answer with what you have.",
  "Efficiency: answer warehouse questions (counts, filters, listings, breakdowns) with query_objects in as few calls as possible. Use document archive tools only when the question is about document contents, files, or named people — not as a fallback for warehouse questions.",
  "Finish with submit_answer: claims cite toolCallId for each number (internal only); assumptions and followUps are separate fields.",
].join("\n");
const ANSWER_STYLE = [
  "## User-facing answer (submit_answer.answer only)",
  "Audience: public-sector or business users — not engineers. This text is shown verbatim in the product.",
  "Style: professional, concise, in the user's language. Open with the direct result in one or two short sentences.",
  "Formatting: use Markdown bullets for examples or options; keep paragraphs short; at most five examples unless the user asked for more.",
  "Never put in answer: tool/API names, object or property ids, ontology/schema/SQL, filter operators, JSON, toolCallId, or how the query was built.",
  "Use plain labels instead of field names (e.g. codice CIG, oggetto della gara, ente appaltante, periodo dei dati / mese di riferimento).",
  "Listings: one line per item — CIG plus a shortened oggetto; avoid long comma-separated runs in prose.",
  "When data is missing: briefly say what cannot be done and suggest two or three useful alternatives — do not enumerate schema properties.",
  "Technical caveats belong in assumptions (brief); followUps should read like natural next questions for the user.",
].join("\n");
function relevantObjectIds(ontology: Ontology, question: string): string[] {
  const ranked = searchOntologySchema(ontology, question, MAX_SCHEMA_SEARCH_HITS)
    .map((hit) => hit.objectId)
    .filter((objectId) => objectId.length > 0);
  const unique = [...new Set(ranked)].slice(0, AGENT_PROMPT_MAX_OBJECTS);
  return unique.length > 0
    ? unique
    : ontology.objects.slice(0, AGENT_PROMPT_MAX_OBJECTS).map((object) => object.id);
}
function section(title: string, lines: string[]): string | undefined {
  return lines.length > 0 ? `${title}\n${lines.join("\n")}` : undefined;
}
function tokenizeForExampleMatch(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 2);
}
function exampleMatchScore(question: string, exampleQuestion: string): number {
  const questionTokens = new Set(tokenizeForExampleMatch(question));
  let score = 0;
  for (const token of tokenizeForExampleMatch(exampleQuestion)) {
    if (questionTokens.has(token)) {
      score += 1;
    }
  }
  return score;
}
export function buildAgentSystemPrompt(ontology: Ontology, question: string): string {
  const glossary = (ontology.semantics?.glossary ?? [])
    .slice(0, AGENT_PROMPT_MAX_GLOSSARY_TERMS)
    .map((term) => {
      const target =
        term.propertyId !== undefined ? ` [${term.objectId ?? "?"}.${term.propertyId}]` : "";
      return `- ${term.term}${target}: ${term.definition}`;
    });
  const examples = [...(ontology.semantics?.examples ?? [])]
    .sort(
      (left, right) =>
        exampleMatchScore(question, right.question) - exampleMatchScore(question, left.question),
    )
    .slice(0, AGENT_PROMPT_MAX_EXAMPLES)
    .map((example) =>
      example.expectedObjectQuery !== undefined
        ? `- Q: ${example.question}\n  query_objects: ${JSON.stringify(example.expectedObjectQuery)}`
        : `- Q: ${example.question}`,
    );
  return [
    PLATFORM_POLICY,
    ANSWER_STYLE,
    `## Schema (ontology v${String(ontology.metadata.version)})\n${renderSemanticContext(ontology, relevantObjectIds(ontology, question))}`,
    section("## Glossary", glossary),
    section("## Verified examples", examples),
  ]
    .filter((part): part is string => part !== undefined)
    .join("\n\n");
}
