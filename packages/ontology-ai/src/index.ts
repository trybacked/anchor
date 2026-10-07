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
