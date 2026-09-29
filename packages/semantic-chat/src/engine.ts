import type { Ontology } from "@trybacked/core";
import type { OntologyQueryRuntime } from "@trybacked/runtime";
import type { InstantiatedPlan, InstantiatedPlanStep } from "./instantiate-template.js";
import { normalizeSemanticQueryPlan, type NormalizedSemanticQueryPlan } from "./normalize.js";
import { buildOntologyContextForTranslation } from "./ontology-context.js";
import { parseJsonFromLlmResponse } from "./parse-llm-json.js";
import {
  RoutedSemanticPlanSchema,
  SemanticQueryPlanSchema,
  type RoutedSemanticPlan,
  type SemanticQueryPlan,
} from "./plan-types.js";
import { buildSemanticTranslationPrompt, buildSemanticRepairPrompt } from "./prompt.js";
import {
  attachEvidenceToProvenance,
  buildQueryExecutionProvenance,
  type RowProvenance,
} from "./provenance.js";
import {
  createDefaultPlanTemplateRegistry,
  type PlanTemplateRegistry,
} from "./template-registry.js";
import {
  SemanticPlanValidationError,
  validateObjectQueryAgainstOntology,
  validateRoutedPlan,
} from "./validate-plan.js";

export type SemanticQueryTranslator = (input: {
  question: string;
  prompt: string;
  ontologyContext: string;
}) => Promise<string>;

export type SemanticChatEngineOptions = {
  ontology: Ontology;
  queryRuntime: OntologyQueryRuntime;
  translate: SemanticQueryTranslator;
  templateRegistry?: PlanTemplateRegistry | undefined;
};

export type SemanticQueryResult = {
  objectId: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  mode: "rows" | "count";
  sql: string;
};

export type SemanticExecutionStepSummary = {
  id: string;
  type: "chunkSearch" | "objectQuery";
  rowCount?: number | undefined;
  documentIds?: string[] | undefined;
  sql?: string | undefined;
};

export type SemanticChatAnswer = {
  question: string;
  route: "single" | "template";
  templateId?: string | undefined;
  plan: NormalizedSemanticQueryPlan;
  result: SemanticQueryResult;
  provenance: RowProvenance[];
  ontologyVersion: number;
  parameterNames: string[];
  attempts: number;
  steps: SemanticExecutionStepSummary[];
};

export class SemanticChatTranslationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SemanticChatTranslationError";
  }
}

export type ExecutePlanInput =
  | SemanticQueryPlan
  | { kind: "single"; plan: SemanticQueryPlan }
  | { kind: "template"; templateId: string; params: Record<string, string | number> };

function parseRoutedPlanFromLlm(text: string): RoutedSemanticPlan {
  let raw: unknown;
  try {
    raw = parseJsonFromLlmResponse(text);
  } catch {
    throw new SemanticChatTranslationError("LLM response is not valid JSON.");
  }
  const parsed = RoutedSemanticPlanSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SemanticChatTranslationError(
      parsed.error.issues[0]?.message ?? "LLM plan does not match routed schema.",
    );
  }
  return parsed.data;
}

function extractDocumentIds(chunks: Record<string, unknown>[]): string[] {
  const ids = new Set<string>();
  for (const chunk of chunks) {
    const documentId = chunk["documentId"] ?? chunk["document_id"];
    if (typeof documentId === "string" && documentId.length > 0) {
      ids.add(documentId);
    }
  }
  return [...ids];
}

async function executeValidatedPlan(
  ontology: Ontology,
  queryRuntime: OntologyQueryRuntime,
  question: string,
  normalized: NormalizedSemanticQueryPlan,
  validated: ReturnType<typeof validateObjectQueryAgainstOntology>,
  evidence: boolean | undefined,
  routeMeta: {
    route: "single" | "template";
    templateId?: string | undefined;
    steps: SemanticExecutionStepSummary[];
  },
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

  const steps =
    routeMeta.steps.length > 0
      ? routeMeta.steps
      : [
          {
            id: "query",
            type: "objectQuery" as const,
            rowCount: execution.rowCount,
            sql: provenanceBundle.sql,
          },
        ];

  return {
    question,
    route: routeMeta.route,
    ...(routeMeta.templateId !== undefined ? { templateId: routeMeta.templateId } : {}),
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
    steps,
  };
}

async function executeInstantiatedTemplate(
  ontology: Ontology,
  queryRuntime: OntologyQueryRuntime,
  question: string,
  instantiated: InstantiatedPlan,
  templateId: string,
  evidence: boolean | undefined,
  attempts: number,
): Promise<SemanticChatAnswer> {
  if (queryRuntime.chunkSearch === undefined) {
    throw new SemanticPlanValidationError(
      "Document chunk search is not configured on this workspace (docs archive unavailable).",
    );
  }

  const stepSummaries: SemanticExecutionStepSummary[] = [];
  const documentIdsByStep = new Map<string, string[]>();
  let lastNormalized: NormalizedSemanticQueryPlan | undefined;
  let lastValidated: ReturnType<typeof validateObjectQueryAgainstOntology> | undefined;

  for (const step of instantiated.steps) {
    if (step.type === "chunkSearch") {
      const chunks = await queryRuntime.chunkSearch({ query: step.query, limit: step.limit });
      const documentIds = extractDocumentIds(chunks);
      documentIdsByStep.set(step.id, documentIds);
      stepSummaries.push({
        id: step.id,
        type: "chunkSearch",
        rowCount: chunks.length,
        documentIds,
      });
      continue;
    }

    const documentIds = resolveConsumedDocumentIds(step, documentIdsByStep);
    if (documentIds.length === 0) {
      throw new SemanticPlanValidationError(
        "Document search returned no matching documents for the template query.",
      );
    }

    const mergedQuery: SemanticQueryPlan["objectQuery"] = {
      ...step.query,
      documentIds,
    };
    lastNormalized = normalizeSemanticQueryPlan({ objectQuery: mergedQuery });
    lastNormalized.attempts = attempts;
    lastValidated = validateObjectQueryAgainstOntology(ontology, lastNormalized.objectQuery);
    stepSummaries.push({
      id: step.id,
      type: "objectQuery",
      documentIds,
    });
  }

  if (lastNormalized === undefined || lastValidated === undefined) {
    throw new SemanticPlanValidationError("Template produced no objectQuery step.");
  }

  const answer = await executeValidatedPlan(
    ontology,
    queryRuntime,
    question,
    lastNormalized,
    lastValidated,
    evidence,
    { route: "template", templateId, steps: stepSummaries },
  );
  const enrichedSteps = answer.steps.map((summary) =>
    summary.type === "objectQuery" && summary.sql === undefined
      ? { ...summary, rowCount: answer.result.rowCount, sql: answer.result.sql }
      : summary,
  );
  return { ...answer, steps: enrichedSteps };
}

function resolveConsumedDocumentIds(
  step: Extract<InstantiatedPlanStep, { type: "objectQuery" }>,
  documentIdsByStep: Map<string, string[]>,
): string[] {
  const ids = new Set<string>();
  for (const consumedId of step.consumes) {
    for (const documentId of documentIdsByStep.get(consumedId) ?? []) {
      ids.add(documentId);
    }
  }
  return [...ids];
}

function normalizeExecutePlanInput(input: ExecutePlanInput): ExecutePlanInput {
  if (typeof input === "object" && input !== null && "kind" in input) {
    return input;
  }
  return { kind: "single", plan: input as SemanticQueryPlan };
}

export function createSemanticChatEngine(options: SemanticChatEngineOptions) {
  const { ontology, queryRuntime, translate } = options;
  const templateRegistry = options.templateRegistry ?? createDefaultPlanTemplateRegistry();

  const translateAndExecute = async (
    question: string,
    evidence: boolean | undefined,
  ): Promise<SemanticChatAnswer> => {
    const ontologyContext = buildOntologyContextForTranslation(ontology);
    const prompt = buildSemanticTranslationPrompt(ontology, question, templateRegistry);
    let attempts = 0;
    let llmText = await translate({ question, prompt, ontologyContext });

    for (;;) {
      attempts += 1;
      const routed = parseRoutedPlanFromLlm(llmText);
      try {
        const validatedRoute = validateRoutedPlan(ontology, templateRegistry, routed);
        if (validatedRoute.route === "template") {
          return executeInstantiatedTemplate(
            ontology,
            queryRuntime,
            question,
            validatedRoute.instantiated,
            validatedRoute.templateId,
            evidence,
            attempts,
          );
        }

        const rawPlan = validatedRoute.semanticPlan;
        const normalized = normalizeSemanticQueryPlan(rawPlan);
        normalized.attempts = attempts;
        const validated = validateObjectQueryAgainstOntology(ontology, normalized.objectQuery);
        return executeValidatedPlan(
          ontology,
          queryRuntime,
          question,
          normalized,
          validated,
          evidence,
          { route: "single", steps: [] },
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
      input: ExecutePlanInput,
      options?: { evidence?: boolean | undefined; question?: string | undefined },
    ): Promise<SemanticChatAnswer> {
      const normalizedInput = normalizeExecutePlanInput(input);
      if ("kind" in normalizedInput && normalizedInput.kind === "template") {
        const template = templateRegistry.get(normalizedInput.templateId);
        if (template === undefined) {
          throw new SemanticPlanValidationError(
            `Unknown plan template "${normalizedInput.templateId}".`,
          );
        }
        const validatedRoute = validateRoutedPlan(ontology, templateRegistry, {
          route: "template",
          templateId: normalizedInput.templateId,
          params: normalizedInput.params,
        });
        if (validatedRoute.route !== "template") {
          throw new SemanticPlanValidationError("Expected template route.");
        }
        const instantiated = validatedRoute.instantiated;
        return executeInstantiatedTemplate(
          ontology,
          queryRuntime,
          options?.question ?? template.description,
          instantiated,
          normalizedInput.templateId,
          options?.evidence,
          1,
        );
      }

      const plan =
        "kind" in normalizedInput && normalizedInput.kind === "single"
          ? normalizedInput.plan
          : (normalizedInput as SemanticQueryPlan);
      SemanticQueryPlanSchema.parse(plan);
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
        { route: "single", steps: [] },
      );
    },
  };
}

export type SemanticChatEngine = ReturnType<typeof createSemanticChatEngine>;
