import { describe, expect, it } from "vitest";
import { getChatAskStatus } from "../../src/chat-ask-status.js";

describe("getChatAskStatus", () => {
  it("reports missing handler as missing_llm_gateway", () => {
    expect(getChatAskStatus({ capabilities: () => ({ aiAsk: false }) })).toEqual({
      available: false,
      reason: "missing_llm_gateway",
    });
  });

  it("reports disabled tenant", () => {
    expect(
      getChatAskStatus({
        capabilities: () => ({ aiAsk: false }),
        semanticAsk: async () => {
          throw new Error("unused");
        },
      }),
    ).toEqual({ available: false, reason: "disabled_for_tenant" });
  });

  it("reports available when handler and aiAsk", () => {
    expect(
      getChatAskStatus({
        capabilities: () => ({ aiAsk: true }),
        semanticAsk: async () => {
          throw new Error("unused");
        },
      }),
    ).toEqual({ available: true });
  });
});
