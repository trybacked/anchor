import { describe, expect, it } from "vitest";
import { parseJsonFromLlmResponse, SemanticQueryPlanSchema } from "../../src/index.js";

describe("parseJsonFromLlmResponse", () => {
  it("parses fenced JSON", () => {
    const raw = parseJsonFromLlmResponse(
      'Here you go:\n```json\n{"objectQuery":{"entityId":"contract","filters":[]}}\n```',
    );
    const plan = SemanticQueryPlanSchema.parse(raw);
    expect(plan.objectQuery.entityId).toBe("contract");
  });
});
