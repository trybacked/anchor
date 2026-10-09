import {
  DEFAULT_AGENT_MAX_QUERY_ROWS,
  DEFAULT_AGENT_MAX_SQL_CALLS,
  DEFAULT_AGENT_MAX_STEPS,
} from "./limits.js";
export { AGENT_GROUNDING_REPAIR_MAX_STEPS as REPAIR_MAX_STEPS } from "./limits.js";
export class SemanticAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SemanticAgentError";
  }
}
export type SemanticAnswerClaim = {
  text: string;
  toolCallId: string;
};
export type SemanticAgentStep = {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  status: "ok" | "error";
  error?: string | undefined;
  rowCount?: number | undefined;
  sql?: string | undefined;
  durationMs: number;
};
export type SemanticAgentUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
};
export type SemanticClarification = {
  question: string;
  options: string[];
};

export const ABSTENTION_REASONS = [
  "no_matching_concept",
  "no_data",
  "insufficient_evidence",
  "out_of_scope",
] as const;
export type AbstentionReason = (typeof ABSTENTION_REASONS)[number];
export type AgentAbstention = {
  reason: AbstentionReason;
  explanation: string;
};
export type AgentAnswer = {
  answer: string;
  claims: SemanticAnswerClaim[];
  assumptions: string[];
  followUps: string[];
};
export type AgentTerminal =
  | ({
      kind: "answer";
    } & AgentAnswer)
  | ({
      kind: "clarification";
    } & SemanticClarification)
  | ({
      kind: "abstained";
    } & AgentAbstention & { followUps: string[] });
export type SemanticAgentResult = {
  runId: string;
  answer: string;
  claims: SemanticAnswerClaim[];
  assumptions: string[];
  followUps: string[];
  steps: SemanticAgentStep[];
  usage: SemanticAgentUsage;
  clarification?: SemanticClarification | undefined;
  abstention?: AgentAbstention | undefined;
  toolResults: Map<string, unknown>;
};
export type AgentBudget = {
  maxSteps: number;
  maxSqlCalls: number;
  maxQueryRows: number;
};
export const DEFAULT_AGENT_BUDGET: AgentBudget = {
  maxSteps: DEFAULT_AGENT_MAX_STEPS,
  maxSqlCalls: DEFAULT_AGENT_MAX_SQL_CALLS,
  maxQueryRows: DEFAULT_AGENT_MAX_QUERY_ROWS,
};
export const TERMINAL_TOOL_NAMES = [
  "submit_answer",
  "ask_clarification",
  "decline_answer",
] as const;
