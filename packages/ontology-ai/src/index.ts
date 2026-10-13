export { parseChangeSet as parseOntologyChangeSet, type ValidatedChangeSet } from "@trybacked/core";
export { createAiSdkLlm, type OntologyLlm } from "./llm.js";
export {
  AiProposalSchema,
  ProposalEvidenceSchema,
  ProposalScopeSchema,
  ProposedChangeSchema,
  parseProposal,
} from "./proposal.js";
export type { AiProposal, ProposalScope, ProposedChange, ValidatedProposal } from "./proposal.js";
export { runOntologyProposal, type RunOntologyProposalOptions } from "./pipeline.js";
export {
  DEFAULT_REVIEW_POLICY,
  ReviewPolicySchema,
  classifyChange,
  isBreakingCommand,
  partitionProposalChanges,
} from "./review-policy.js";
export type { ReviewDecision, ReviewPolicy } from "./review-policy.js";
export {
  ChangeDecisionSchema,
  ChangeVerdictSchema,
  ProposalReviewOutcomeSchema,
} from "./decision/change-decision.js";
export type {
  ChangeDecision,
  ChangeVerdict,
  ProposalReviewOutcome,
} from "./decision/change-decision.js";
export {
  DecisionPolicySchema,
  DEFAULT_DECISION_POLICY,
  readDecisionPolicyFromEnv,
} from "./decision/decision-policy.js";
export type { DecisionPolicy } from "./decision/decision-policy.js";
export { decideProposalChanges, summarizeDecisions } from "./decision/decide-changes.js";
export { combineChangeDecision } from "./decision/combine-decision.js";
export { CATALOG_VERSION, RISK_TAGS, RiskTagSchema } from "./decision/question-catalog.js";
