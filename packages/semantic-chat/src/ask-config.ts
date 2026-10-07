import {
  DEFAULT_AGENT_MAX_QUERY_ROWS,
  DEFAULT_AGENT_MAX_SQL_CALLS,
  DEFAULT_AGENT_MAX_STEPS,
} from "./agent/limits.js";
import type { AgentBudget } from "./agent/types.js";

export const ASK_STRATEGIES = ["plan-first", "agent"] as const;
export type AskStrategy = (typeof ASK_STRATEGIES)[number];

function readPositiveInt(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key]?.trim();
  if (raw === undefined || raw.length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function agentBudgetFromEnv(env: NodeJS.ProcessEnv): AgentBudget {
  return {
    maxSteps: readPositiveInt(env, "SEMANTIC_AGENT_MAX_STEPS", DEFAULT_AGENT_MAX_STEPS),
    maxSqlCalls: readPositiveInt(env, "SEMANTIC_AGENT_MAX_SQL_CALLS", DEFAULT_AGENT_MAX_SQL_CALLS),
    maxQueryRows: readPositiveInt(
      env,
      "SEMANTIC_AGENT_MAX_QUERY_ROWS",
      DEFAULT_AGENT_MAX_QUERY_ROWS,
    ),
  };
}

/** Skip grounding repair when the main pass already consumed this many ms (LLM budget). */
export function agentSkipRepairAfterMsFromEnv(env: NodeJS.ProcessEnv): number {
  return readPositiveInt(env, "SEMANTIC_AGENT_SKIP_REPAIR_AFTER_MS", 35_000);
}

/** plan-first (default): one structured LLM call → governed query → deterministic answer; agent loop only as fallback. */
export function askStrategyFromEnv(env: NodeJS.ProcessEnv): AskStrategy {
  const raw = env["SEMANTIC_ASK_STRATEGY"]?.trim();
  return ASK_STRATEGIES.find((strategy) => strategy === raw) ?? "plan-first";
}
