import { describe, expect, it } from "vitest";
import type { AnchorService } from "../../src/anchor-service.js";
import { getChatAskStatus } from "../../src/chat-ask-status.js";
function serviceWith(options: { aiAsk: boolean; withHandler: boolean }): AnchorService {
  return {
    capabilities: () => ({ aiAsk: options.aiAsk }),
    ...(options.withHandler
      ? {
          semanticAsk: async () => {
            throw new Error("unused");
          },
        }
      : {}),
  } as unknown as AnchorService;
}
describe("getChatAskStatus", () => {
  it("reports a missing handler as missing_llm_gateway", () => {
    expect(getChatAskStatus(serviceWith({ aiAsk: false, withHandler: false }))).toEqual({
      available: false,
      reason: "missing_llm_gateway",
    });
  });
  it("reports a disabled tenant", () => {
    expect(getChatAskStatus(serviceWith({ aiAsk: false, withHandler: true }))).toEqual({
      available: false,
      reason: "disabled_for_tenant",
    });
  });
  it("reports available when the handler exists and aiAsk is on", () => {
    expect(getChatAskStatus(serviceWith({ aiAsk: true, withHandler: true }))).toEqual({
      available: true,
    });
  });
});
