import { describe, expect, it } from "vitest";
import { tenantAiAskEnabled } from "../../src/tenant-ai-ask.js";

describe("tenantAiAskEnabled", () => {
  it("defaults on unless aiAsk or legacy semanticAgent is false", () => {
    expect(tenantAiAskEnabled(undefined)).toBe(true);
    expect(tenantAiAskEnabled({ aiAsk: true })).toBe(true);
    expect(tenantAiAskEnabled({ aiAsk: false })).toBe(false);
    expect(tenantAiAskEnabled({ semanticAgent: false })).toBe(false);
  });
});
