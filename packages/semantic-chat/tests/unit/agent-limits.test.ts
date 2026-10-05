import { SEMANTIC_CHAT_MAX_ROW_LIMIT } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import {
  AGENT_GROUNDING_REPAIR_MAX_STEPS,
  DEFAULT_AGENT_MAX_QUERY_ROWS,
  DEFAULT_AGENT_MAX_SQL_CALLS,
  DEFAULT_AGENT_MAX_STEPS,
} from "../../src/agent/limits.js";
import { DEFAULT_AGENT_BUDGET } from "../../src/agent/types.js";
describe("agent limits", () => {
  it("keeps DEFAULT_AGENT_BUDGET aligned with limits.ts", () => {
    expect(DEFAULT_AGENT_BUDGET).toEqual({
      maxSteps: DEFAULT_AGENT_MAX_STEPS,
      maxSqlCalls: DEFAULT_AGENT_MAX_SQL_CALLS,
      maxQueryRows: DEFAULT_AGENT_MAX_QUERY_ROWS,
    });
  });
  it("ties query row cap to the semantic_chat warehouse profile", () => {
    expect(DEFAULT_AGENT_MAX_QUERY_ROWS).toBe(SEMANTIC_CHAT_MAX_ROW_LIMIT);
  });
  it("allows repair without exceeding the main step budget", () => {
    expect(AGENT_GROUNDING_REPAIR_MAX_STEPS).toBeLessThanOrEqual(DEFAULT_AGENT_MAX_STEPS);
  });
});
