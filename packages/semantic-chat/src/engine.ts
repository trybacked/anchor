import type { Ontology } from "@trybacked/core";
import type { OntologyQueryRuntime } from "@trybacked/runtime";
import { normalizeSemanticQueryPlan, type NormalizedSemanticQueryPlan } from "./normalize.js";
import {
  attachEvidenceToProvenance,
  buildQueryExecutionProvenance,
  type RowProvenance,
} from "./provenance.js";
import { SemanticQueryPlanSchema, type SemanticQueryPlan } from "./plan-types.js";
import { validateObjectQueryAgainstOntology } from "./validate-plan.js";

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
  type: "objectQuery";
  rowCount?: number | undefined;
  sql?: string | undefined;
};

export type SemanticChatAnswer = {
  question: string;
  route: "single";
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

export type ExecutePlanInput = SemanticQueryPlan | { kind: "single"; plan: SemanticQueryPlan };

function normalizeExecutePlanInput(input: ExecutePlanInput): SemanticQueryPlan {
  if ("kind" in input) {
    return input.plan;
  }
  return input;
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
    route: "single",
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
    steps: [
      {
        id: "query",
        type: "objectQuery",
        rowCount: execution.rowCount,
        sql: provenanceBundle.sql,
      },
    ],
  };
}

export type SemanticChatEngineOptions = {
  ontology: Ontology;
  queryRuntime: OntologyQueryRuntime;
};

export function createSemanticChatEngine(options: SemanticChatEngineOptions) {
  const { ontology, queryRuntime } = options;

  return {
    async executePlan(
      input: ExecutePlanInput,
      options?: { evidence?: boolean | undefined; question?: string | undefined },
    ): Promise<SemanticChatAnswer> {
      const plan = normalizeExecutePlanInput(input);
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
      );
    },
  };
}

export type SemanticChatEngine = ReturnType<typeof createSemanticChatEngine>;
