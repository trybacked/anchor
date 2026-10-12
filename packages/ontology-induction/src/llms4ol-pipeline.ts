import type { AuthoringCommandV2 } from "@trybacked/core";
import { createGatewayLanguageModel, requireAiGatewayApiKey } from "@trybacked/infrastructure";
import { listPacks } from "@trybacked/ontology-authoring";
import { z } from "zod";
import { formatCompetencyBlock } from "./competency.js";
import type { CorpusExcerpt } from "./corpus-sample.js";

/** LLMs4OL (2307.16648) + Ontology engineering with LLM (2307.16699): staged schema induction. */
const TermsStepSchema = z.object({
  terms: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      description: z.string().optional(),
      evidenceUri: z.string().min(1),
    }),
  ),
});

const RelationsStepSchema = z.object({
  relations: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      fromObjectTypeId: z.string().min(1),
      toObjectTypeId: z.string().min(1),
      cardinality: z.enum(["one_to_one", "one_to_many", "many_to_one", "many_to_many"]),
      evidenceUri: z.string().min(1),
    }),
  ),
});

function resolveModelId(env: NodeJS.ProcessEnv): string {
  return (
    env["ONTOLOGY_EXTRACT_MODEL"]?.trim() || env["SEMANTIC_MODEL"]?.trim() || "openai/gpt-4o-mini"
  );
}

function packReuseHint(): string {
  const packs = listPacks();
  if (packs.length === 0) {
    return "";
  }
  return `\nReuse vocabulary from packs when excerpts support it: ${packs.map((pack) => `${pack.id} (${pack.name})`).join("; ")}.`;
}

function termsToCommands(terms: z.infer<typeof TermsStepSchema>["terms"]): AuthoringCommandV2[] {
  return terms.map((term) => ({
    type: "addObjectType" as const,
    objectType: {
      id: term.id,
      name: term.name,
      description: term.description,
      backing: [{ sourceId: "primary", datasetId: `docs.${term.id}`, columnMappings: {} }],
      properties: [
        {
          kind: "physical" as const,
          id: "name",
          name: "Name",
          type: "string" as const,
          bindingSourceId: "primary",
          column: "name",
          role: "attribute" as const,
          nullable: true,
          confidence: 0.75,
          provenance: { evidence: `llms4ol:terms:${term.evidenceUri}` },
          status: "proposed" as const,
          source: "inferred" as const,
        },
      ],
      confidence: 0.75,
      provenance: { evidence: `llms4ol:terms:${term.evidenceUri}` },
      status: "proposed" as const,
      source: "inferred" as const,
    },
  }));
}

function relationsToCommands(
  relations: z.infer<typeof RelationsStepSchema>["relations"],
): AuthoringCommandV2[] {
  return relations.map((relation) => ({
    type: "addLinkType" as const,
    linkType: {
      id: relation.id,
      name: relation.name,
      fromObjectTypeId: relation.fromObjectTypeId,
      toObjectTypeId: relation.toObjectTypeId,
      cardinality: relation.cardinality,
      keyMappings: [],
      confidence: 0.7,
      provenance: { evidence: `llms4ol:relations:${relation.evidenceUri}` },
      status: "proposed" as const,
      source: "inferred" as const,
    },
  }));
}

function skosCommandsFromTerms(
  terms: z.infer<typeof TermsStepSchema>["terms"],
): AuthoringCommandV2[] {
  return terms.map((term) => ({
    type: "setObjectTypeSemantics" as const,
    objectTypeId: term.id,
    semantics: {
      synonyms: [term.name.toLowerCase()],
      labels: { en: { singular: term.name, plural: `${term.name}s` } },
    },
  }));
}

export async function runLlms4OlInduction(options: {
  env: NodeJS.ProcessEnv;
  workspaceRoot: string;
  samples: CorpusExcerpt[];
  competencyQuestions: readonly string[];
}): Promise<AuthoringCommandV2[]> {
  requireAiGatewayApiKey(options.env);
  if (options.samples.length === 0) {
    throw new Error("Cannot induce ontology: no parsed corpus — run ingest first.");
  }
  const excerptBlock = options.samples
    .map((sample, index) => `### Excerpt ${String(index + 1)} (${sample.uri})\n${sample.excerpt}`)
    .join("\n\n");
  const competencyBlock = formatCompetencyBlock(options.competencyQuestions);
  const fallbackModelId = options.env["ONTOLOGY_EXTRACT_FALLBACK_MODEL"]?.trim();
  const llm = createGatewayLanguageModel({
    modelId: resolveModelId(options.env),
    ...(fallbackModelId !== undefined && fallbackModelId.length > 0 ? { fallbackModelId } : {}),
    cacheDir: `${options.workspaceRoot}/.backed/llm-cache`,
  });

  const termsResult = await llm.generateStructured<z.infer<typeof TermsStepSchema>>({
    schemaName: "ontology_terms",
    schema: TermsStepSchema,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "You perform ontology learning (LLMs4OL). Propose business object types grounded in excerpts. Use snake_case ids. Minimum ontological commitment: only types clearly supported by text." +
          packReuseHint(),
      },
      {
        role: "user",
        content: `Competency questions:\n${competencyBlock}\n\nCorpus excerpts:\n${excerptBlock}\n\nReturn up to 8 object types with evidenceUri pointing to the excerpt uri.`,
      },
    ],
  });

  const terms = termsResult.value.terms;
  const relationsResult = await llm.generateStructured<z.infer<typeof RelationsStepSchema>>({
    schemaName: "ontology_relations",
    schema: RelationsStepSchema,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "Propose link types between the given object types. Only relations explicitly suggested by the excerpts (Text2KGBench: avoid hallucinated edges).",
      },
      {
        role: "user",
        content: `Object types: ${terms.map((term) => term.id).join(", ")}\n\nExcerpts:\n${excerptBlock}\n\nReturn up to 6 relations.`,
      },
    ],
  });

  return [
    ...termsToCommands(terms),
    ...relationsToCommands(relationsResult.value.relations),
    ...skosCommandsFromTerms(terms),
  ];
}
