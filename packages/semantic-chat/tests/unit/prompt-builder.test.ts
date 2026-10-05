import { describe, expect, it } from "vitest";
import { buildAgentSystemPrompt } from "../../src/agent/prompt-builder.js";
import { buildPlannerSystemPrompt } from "../../src/plan-first/planner.js";
import { contractOntology } from "./agent-fixtures.js";

describe("system prompts", () => {
  it("agent prompt includes user-facing answer style for non-technical UI copy", () => {
    const prompt = buildAgentSystemPrompt(contractOntology(), "Quanti contratti?");
    expect(prompt).toContain("User-facing answer");
    expect(prompt).toContain("not engineers");
    expect(prompt).toContain("Never put in answer");
  });

  it("planner prompt shares query rules and schema but not the agent tool workflow", () => {
    const prompt = buildPlannerSystemPrompt(contractOntology(), "Quanti contratti?");
    expect(prompt).toContain("exactly one governed ObjectQuery");
    expect(prompt).toContain("Choosing properties");
    expect(prompt).toContain("### contract (Contract)");
    expect(prompt).not.toContain("submit_answer");
  });
});
