import { describe, expect, it } from "vitest";
import { createVercelAiTranslatorFromEnv } from "../../src/adapters/vercel-ai.js";

describe("createVercelAiTranslatorFromEnv", () => {
  it("returns undefined without AI_GATEWAY_API_KEY", () => {
    expect(createVercelAiTranslatorFromEnv({})).toBeUndefined();
    expect(createVercelAiTranslatorFromEnv({ AI_GATEWAY_API_KEY: "  " })).toBeUndefined();
  });

  it("returns a translator when the gateway key is set", () => {
    const translator = createVercelAiTranslatorFromEnv({
      AI_GATEWAY_API_KEY: "test-key",
      SEMANTIC_CHAT_MODEL: "openai/gpt-4o-mini",
    });
    expect(typeof translator).toBe("function");
  });
});
