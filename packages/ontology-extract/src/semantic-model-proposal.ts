import { DEFAULT_REVIEW_CONFIDENCE_THRESHOLD, type Proposal, type SemanticModel } from "@trybacked/core";
import { buildReviewQuestions } from "@trybacked/discovery";

export function proposalFromSemanticModel(
  model: SemanticModel,
  options: {
    runId: string;
    generatedAt?: string;
    reviewConfidenceThreshold?: number;
  },
): Proposal {
  const threshold = options.reviewConfidenceThreshold ?? DEFAULT_REVIEW_CONFIDENCE_THRESHOLD;
  const entities = model.entities.map((entity) => ({
    ...entity,
    status: "proposed" as const,
  }));
  const relations = model.relations.map((relation) => ({
    ...relation,
    status: "proposed" as const,
  }));
  const questions = buildReviewQuestions(entities, relations, threshold);
  return {
    runId: options.runId,
    generatedAt: options.generatedAt ?? model.metadata.generatedAt,
    entities,
    relations,
    rules: model.rules ?? [],
    doubts: [],
    questions,
  };
}
