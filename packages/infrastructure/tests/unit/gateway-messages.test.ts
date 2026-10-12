import { describe, expect, it } from "vitest";
import { gatewayPromptFromLlmMessages } from "../../src/adapters/llm/gateway-messages.js";

describe("gatewayPromptFromLlmMessages", () => {
  it("maps system role to instructions", () => {
    const prompt = gatewayPromptFromLlmMessages([
      { role: "system", content: "You are an ontology engineer." },
      { role: "user", content: "Extract terms." },
    ]);
    expect(prompt.instructions).toBe("You are an ontology engineer.");
    expect(prompt.messages).toEqual([{ role: "user", content: "Extract terms." }]);
  });
});
