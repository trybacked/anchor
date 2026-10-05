import { describe, expect, it } from "vitest";
import { buildAgentSystemPrompt } from "../../src/agent/prompt-builder.js";
import { buildPlannerSystemPrompt } from "../../src/plan-first/planner.js";
import { contractOntology } from "./agent-fixtures.js";

describe("system prompts", () => {
  it("agent prompt includes user-facing answer style for non-technical UI copy", () => {
    const prompt = buildAgentSystemPrompt({
      ontology: contractOntology(),
      question: "Quanti contratti?",
    });
    expect(prompt).toContain("User-facing answer");
    expect(prompt).toContain("not engineers");
    expect(prompt).toContain("Never put in answer");
  });

  it("planner prompt shares query rules and schema but not the agent tool workflow", () => {
    const prompt = buildPlannerSystemPrompt({
      ontology: contractOntology(),
      question: "Quanti contratti?",
    });
    expect(prompt).toContain("exactly one governed ObjectQuery");
    expect(prompt).toContain("Choosing properties");
    expect(prompt).toContain("### contract (Contract)");
    expect(prompt).not.toContain("submit_answer");
  });

  it("planner prompt carries the interface language when known", () => {
    const ontology = contractOntology();
    expect(
      buildPlannerSystemPrompt({ ontology, question: "ai in calabria", locale: "it" }),
    ).toContain('interface language is "it"');
    expect(buildPlannerSystemPrompt({ ontology, question: "ai in calabria" })).not.toContain(
      "interface language",
    );
  });

  it("both prompts carry the conversation thread with the last query", () => {
    const history = [
      { role: "user" as const, text: "Quanti contratti a giugno 2025?" },
      {
        role: "assistant" as const,
        text: "**121.416** Contract",
        query: {
          objectId: "contract",
          mode: "count" as const,
          filters: [{ propertyId: "source_year_month", op: "eq" as const, value: "2025-06" }],
        },
      },
    ];
    const context = { ontology: contractOntology(), question: "e in Sicilia?", history };
    for (const prompt of [buildPlannerSystemPrompt(context), buildAgentSystemPrompt(context)]) {
      expect(prompt).toContain("Conversation so far");
      expect(prompt).toContain("- User: Quanti contratti a giugno 2025?");
      expect(prompt).toContain('"source_year_month","op":"eq","value":"2025-06"');
    }
    expect(buildPlannerSystemPrompt({ ...context, history: [] })).not.toContain(
      "Conversation so far",
    );
  });
});
