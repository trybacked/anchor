import { describe, expect, it } from "vitest";
import { SEMANTIC_ASK_MAX_HISTORY_TURNS, SemanticAskBodySchema } from "../../src/contracts.js";

describe("SemanticAskBodySchema", () => {
  it("accepts the bare question as before", () => {
    expect(SemanticAskBodySchema.parse({ question: "Quanti contratti?" })).toEqual({
      question: "Quanti contratti?",
    });
  });

  it("accepts locale, conversationId and a thread with the previous query", () => {
    const parsed = SemanticAskBodySchema.parse({
      question: "e in Sicilia?",
      locale: "it",
      conversationId: "chat-1",
      history: [
        { role: "user", text: "Quanti contratti a giugno 2025?" },
        {
          role: "assistant",
          text: "121.416",
          query: {
            objectId: "contract",
            mode: "count",
            filters: [{ propertyId: "source_year_month", op: "eq", value: "2025-06" }],
          },
        },
      ],
    });
    expect(parsed.history).toHaveLength(2);
    expect(parsed.history?.[1]?.query?.objectId).toBe("contract");
  });

  it("rejects malformed turns and oversized threads", () => {
    expect(
      SemanticAskBodySchema.safeParse({ question: "x", history: [{ role: "system", text: "y" }] })
        .success,
    ).toBe(false);
    const history = Array.from({ length: SEMANTIC_ASK_MAX_HISTORY_TURNS + 1 }, () => ({
      role: "user",
      text: "y",
    }));
    expect(SemanticAskBodySchema.safeParse({ question: "x", history }).success).toBe(false);
  });
});
