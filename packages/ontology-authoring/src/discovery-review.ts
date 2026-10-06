import type { Proposal } from "@trybacked/core";
import { collectVerdicts, type Review } from "@trybacked/core";

export type DiscoveryReviewValidation = {
  unansweredQuestionIds: string[];
  staleAnswerCount: number;
};

export function validateDiscoveryReview(
  proposal: Proposal,
  review: Review,
): DiscoveryReviewValidation {
  const { staleAnswerCount } = collectVerdicts(proposal.questions, review.answers);
  const answeredIds = new Set(review.answers.map((answer) => answer.questionId));
  const unansweredQuestionIds = proposal.questions
    .filter((question) => !answeredIds.has(question.id))
    .map((question) => question.id);
  return { unansweredQuestionIds, staleAnswerCount };
}

export const AUTHORING_COMMAND_BATCH_SIZE = 100;

export function chunkAuthoringCommands<T>(
  commands: readonly T[],
  batchSize: number = AUTHORING_COMMAND_BATCH_SIZE,
): T[][] {
  if (commands.length === 0) {
    return [];
  }
  const batches: T[][] = [];
  for (let index = 0; index < commands.length; index += batchSize) {
    batches.push(commands.slice(index, index + batchSize));
  }
  return batches;
}
