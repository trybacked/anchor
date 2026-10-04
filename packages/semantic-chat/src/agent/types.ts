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

export type SemanticAgentResult = {
  runId: string;
  answer: string;
  claims: SemanticAnswerClaim[];
  assumptions: string[];
  followUps: string[];
  steps: SemanticAgentStep[];
  usage: SemanticAgentUsage;
  clarification?: SemanticClarification | undefined;
  toolResults: Map<string, unknown>;
};

export type AgentBudget = {
  maxSteps: number;
  maxSqlCalls: number;
};

export const DEFAULT_AGENT_BUDGET: AgentBudget = {
  maxSteps: 12,
  maxSqlCalls: 6,
};
