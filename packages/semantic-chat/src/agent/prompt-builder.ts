import type { Ontology } from "@trybacked/core";
import {
  MAX_SCHEMA_SEARCH_HITS,
  searchOntologySchema,
  type ConversationTurn,
} from "@trybacked/service";
import { buildConversationSection, buildLocaleSection } from "../conversation.js";
import {
  SemanticPlanValidationError,
  validateObjectQueryAgainstOntology,
} from "../validate-plan.js";
import { renderSemanticContext } from "./agent-ontology-view.js";
import {
  AGENT_PROMPT_MAX_EXAMPLES,
  AGENT_PROMPT_MAX_GLOSSARY_TERMS,
  AGENT_PROMPT_MAX_OBJECTS,
} from "./limits.js";

export const QUERY_CONSTRUCTION_RULES = [
  "Choosing properties: prefer the property whose description or synonyms match the question wording.",
  "Periods: when the question gives a month or period without naming a date field, filter the object's default time dimension and record that choice in assumptions. Respect valueFormat (e.g. YYYY-MM). For several periods use one filter with op in and all values — not separate queries.",
  "Modes: mode count for totals; mode rows with select and limit for listings; groupBy plus aggregations for breakdowns; orderBy plus orderDirection for rankings.",
  'Cross-object questions: objectId stays the object being counted or listed; constrain a related object with joins [{"relationshipId": "..."}] plus filters entries carrying that related objectId. Never switch the root object to the one you only filter on.',
  'Breakdowns: with groupBy plus aggregations, orderBy must name a projected column — a groupBy property or an aggregation alias — so set alias on the aggregation you want to rank by. To break down by an attribute of a related object, add the join and write the groupBy entry as "objectId.propertyId" (e.g. "relatedEntity.attributeId").',
  "When a filter names an attribute of a related entity, keep objectId on the entity you count and put the filter on that related objectId — do not count the related entity alone.",
  'Names and free text: when the question gives a name or topic rather than a code, use a contains filter (or textSearch {"query": "...", "propertyIds": [...]} for rows) instead of guessing an exact value; textSearch cannot be combined with mode count.',
].join("\n");
const PLATFORM_POLICY = [
  "You are a governed warehouse analyst. Answer only from tool results; never invent counts, rows, or values.",
  "Workflow: pick the object and properties from the schema below, then call query_objects. Call get_entity only for objects or properties not listed below.",
  QUERY_CONSTRUCTION_RULES,
  "Prefer answering with explicit assumptions over asking. Call ask_clarification only when interpretations would materially change the answer and the semantics below cannot settle it; when unsure between properties, fill ambiguity with the candidate property ids.",
  "If a tool returns an error, read it, correct the input, and retry once — then answer with what you have.",
  "Abstention policy: when no schema concept matches the question, the query returns zero rows, or the excerpts do not contain the asked facts, call decline_answer with the matching reason and a short explanation in the user's language instead of inventing an answer. decline_answer is a complete, user-respecting outcome.",
  "Efficiency: structured warehouse counts use query_objects when the ontology exposes matching entities. Questions about file contents or the tenant document archive must use search_documents first.",
  "When search_documents returns hits, cite filenames and short excerpts in submit_answer; when it returns no rows, say so and only then mention warehouse limits.",
  "Finish with submit_answer: claims cite toolCallId for each number (internal only); assumptions and followUps are separate fields.",
].join("\n");
const ANSWER_STYLE = [
  "## User-facing answer (submit_answer.answer only)",
  "Audience: domain and business users — not engineers. This text is shown verbatim in the product.",
  "Style: professional, concise, in the user's language. Open with the direct result in one or two short sentences.",
  "Formatting: use Markdown bullets for examples or options; keep paragraphs short; at most five examples unless the user asked for more.",
  "Never put in answer: tool/API names, object or property ids, ontology/schema/SQL, filter operators, JSON, toolCallId, or how the query was built.",
  "Use plain labels instead of field names: derive them from the ontology glossary and property display labels for the tenant's domain.",
  "Listings: one line per item, led by the label the glossary defines as the primary identifier; avoid long comma-separated runs in prose.",
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
type VerifiedExample = NonNullable<NonNullable<Ontology["semantics"]>["examples"]>[number];

function formatVerifiedExample(example: VerifiedExample): string {
  const query = example.expectedObjectQuery;
  if (query === undefined) {
    return `- Q: ${example.question}`;
  }
  return `- Q: ${example.question}\n  Query: ${JSON.stringify(query)}`;
}

function exampleFitsOntology(ontology: Ontology, example: VerifiedExample): boolean {
  if (example.expectedObjectQuery === undefined) return true;
  try {
    validateObjectQueryAgainstOntology(ontology, example.expectedObjectQuery);
    return true;
  } catch (error) {
    if (error instanceof SemanticPlanValidationError) return false;
    throw error;
  }
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

export function buildSemanticContextSections(ontology: Ontology, question: string): string[] {
  const glossary = (ontology.semantics?.glossary ?? [])
    .slice(0, AGENT_PROMPT_MAX_GLOSSARY_TERMS)
    .map((term) => {
      const target =
        term.propertyId !== undefined ? ` [${term.objectId ?? "?"}.${term.propertyId}]` : "";
      return `- ${term.term}${target}: ${term.definition}`;
    });
  const examples = (ontology.semantics?.examples ?? [])
    .filter((example) => exampleFitsOntology(ontology, example))
    .sort(
      (left, right) =>
        exampleMatchScore(question, right.question) - exampleMatchScore(question, left.question),
    )
    .slice(0, AGENT_PROMPT_MAX_EXAMPLES)
    .map((example) => formatVerifiedExample(example));
  return [
    `## Schema (ontology v${String(ontology.metadata.version)})\n${renderSemanticContext(ontology, relevantObjectIds(ontology, question))}`,
    section("## Glossary", glossary),
    section("## Verified examples", examples),
  ].filter((part): part is string => part !== undefined);
}
export type AgentPromptContext = {
  ontology: Ontology;
  question: string;
  locale?: string | undefined;
  history?: readonly ConversationTurn[] | undefined;
};
export function buildAgentSystemPrompt(context: AgentPromptContext): string {
  return [
    PLATFORM_POLICY,
    ANSWER_STYLE,
    ...buildLocaleSection(context.locale),
    ...buildConversationSection(context.history),
    ...buildSemanticContextSections(context.ontology, context.question),
  ].join("\n\n");
}
