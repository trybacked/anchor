import type { Ontology } from "@trybacked/core";
import type { OntologyQueryRuntime } from "@trybacked/runtime";
import { normalizeSemanticQueryPlan, type NormalizedSemanticQueryPlan } from "./normalize.js";
import { buildOntologyContextForTranslation } from "./ontology-context.js";
import { parseJsonFromLlmResponse } from "./parse-llm-json.js";
import { SemanticQueryPlanSchema, type SemanticQueryPlan } from "./plan-types.js";
import { buildSemanticTranslationPrompt, buildSemanticRepairPrompt } from "./prompt.js";
import {
  attachEvidenceToProvenance,
  buildQueryExecutionProvenance,
  type RowProvenance,
} from "./provenance.js";
import { SemanticPlanValidationError, validateObjectQueryAgainstOntology } from "./validate-plan.js";

export type SemanticQueryTranslator = (input: {
  question: string;
  prompt: string;
  ontologyContext: string;
}) => Promise<string>;

export type SemanticChatEngineOptions = {
  ontology: Ontology;
  queryRuntime: OntologyQueryRuntime;
  translate: SemanticQueryTranslator;
};

export type SemanticQueryResult = {
  objectId: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  mode: "rows" | "count";
  sql: string;
};

export type SemanticChatAnswer = {
  question: string;
  plan: NormalizedSemanticQueryPlan;
  result: SemanticQueryResult;
  provenance: RowProvenance[];
  ontologyVersion: number;
  parameterNames: string[];
  attempts: number;
};

export class SemanticChatTranslationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SemanticChatTranslationError";
  }
}

function parsePlanFromLlm(text: string): SemanticQueryPlan {
  let raw: unknown;
  try {
    raw = parseJsonFromLlmResponse(text);
  } catch {
    throw new SemanticChatTranslationError("LLM response is not valid JSON.");
  }
  const parsed = SemanticQueryPlanSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SemanticChatTranslationError(
      parsed.error.issues[0]?.message ?? "LLM plan does not match SemanticQueryPlan schema.",
    );
  }
  return parsed.data;
}

async function executeValidatedPlan(
  ontology: Ontology,
  queryRuntime: OntologyQueryRuntime,
  question: string,
  normalized: NormalizedSemanticQueryPlan,
  validated: ReturnType<typeof validateObjectQueryAgainstOntology>,
  evidence: boolean | undefined,
): Promise<SemanticChatAnswer> {
  const mode = validated.mode ?? "rows";
  const execution = await queryRuntime.queryObjects(validated);
  const provenanceBundle = buildQueryExecutionProvenance({
    ontology,
    objectQuery: validated,
    rows: execution.rows,
  });
  let provenance = provenanceBundle.provenance;
  if (evidence === true && queryRuntime.chunkSearch !== undefined) {
    provenance = await attachEvidenceToProvenance({
      provenance,
      rows: execution.rows,
      chunkSearch: queryRuntime.chunkSearch,
    });
  }

  return {
    question,
    plan: { ...normalized, objectQuery: validated },
    result: {
      objectId: execution.objectId,
      columns: execution.columns,
      rows: execution.rows,
      rowCount: execution.rowCount,
      mode,
      sql: provenanceBundle.sql,
    },
    provenance,
    ontologyVersion: ontology.metadata.version,
    parameterNames: provenanceBundle.parameterNames,
    attempts: normalized.attempts ?? 1,
  };
}

export function createSemanticChatEngine(options: SemanticChatEngineOptions) {
  const { ontology, queryRuntime, translate } = options;

  const translateAndExecute = async (
    question: string,
    evidence: boolean | undefined,
  ): Promise<SemanticChatAnswer> => {
    const ontologyContext = buildOntologyContextForTranslation(ontology);
    const prompt = buildSemanticTranslationPrompt(ontology, question);
    let attempts = 0;
    let llmText = await translate({ question, prompt, ontologyContext });

    for (;;) {
      attempts += 1;
      const rawPlan = parsePlanFromLlm(llmText);
      const normalized = normalizeSemanticQueryPlan(rawPlan);
      normalized.attempts = attempts;
      try {
        const validated = validateObjectQueryAgainstOntology(ontology, normalized.objectQuery);
        return await executeValidatedPlan(
          ontology,
          queryRuntime,
          question,
          normalized,
          validated,
          evidence,
        );
      } catch (error) {
        if (!(error instanceof SemanticPlanValidationError)) {
          throw error;
        }
        if (attempts >= 2) {
          throw error;
        }
        const repairPrompt = buildSemanticRepairPrompt(question, error.message, llmText);
        llmText = await translate({ question, prompt: repairPrompt, ontologyContext });
      }
    }
  };

  return {
    async ask(
      question: string,
      options?: { evidence?: boolean | undefined },
    ): Promise<SemanticChatAnswer> {
      const trimmed = question.trim();
      if (trimmed.length === 0) {
        throw new SemanticChatTranslationError("Question must not be empty.");
      }
      return translateAndExecute(trimmed, options?.evidence);
    },

    async executePlan(
      plan: SemanticQueryPlan,
      options?: { evidence?: boolean | undefined; question?: string | undefined },
    ): Promise<SemanticChatAnswer> {
      const normalized = normalizeSemanticQueryPlan(plan);
      normalized.attempts = 1;
      const validated = validateObjectQueryAgainstOntology(ontology, normalized.objectQuery);
      return executeValidatedPlan(
        ontology,
        queryRuntime,
        options?.question ?? plan.reasoning ?? "",
        normalized,
        validated,
        options?.evidence,
      );
    },
  };
}

export type SemanticChatEngine = ReturnType<typeof createSemanticChatEngine>;
