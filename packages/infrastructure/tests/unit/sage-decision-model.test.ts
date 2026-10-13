import type { DecisionGroup } from "@trybacked/ports";
import { DecisionModelUnavailableError } from "@trybacked/ports";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSageDecisionModel } from "../../src/adapters/sage/sage-decision-model.js";

const config = {
  apiKey: "lv_live_test_key",
  baseUrl: "https://sage.levanto.ai",
  timeoutMs: 5000,
  reasoning: "off" as const,
};

const group: DecisionGroup = {
  content: "sample change",
  questions: [{ kind: "yesno", id: "accept", question: "Accept?" }],
};

describe("createSageDecisionModel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps a successful batch response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              answers: [
                {
                  ok: true,
                  result: {
                    id: "accept",
                    kind: "yesno",
                    result: { answer: "yes", probability: 0.93 },
                  },
                },
              ],
            },
          ],
          meta: { model: "levanto-sage-v1.3", usage: { input_tokens: 10, output_tokens: 2 } },
        }),
      })),
    );
    const model = createSageDecisionModel(config);
    const batch = await model.decideBatch([group]);
    expect(batch.modelId).toBe("levanto-sage-v1.3");
    expect(batch.groups[0]?.ok).toBe(true);
    if (batch.groups[0]?.ok) {
      expect(batch.groups[0].answers[0]?.kind).toBe("yesno");
    }
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe("Bearer lv_live_test_key");
  });

  it("maps HTTP 402 to quota unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 402,
        json: async () => ({}),
      })),
    );
    const model = createSageDecisionModel(config);
    await expect(model.decideBatch([group])).rejects.toMatchObject({ reason: "quota" });
  });

  it("does not leak api key in unavailable errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({}),
      })),
    );
    const model = createSageDecisionModel(config);
    await expect(model.decideBatch([group])).rejects.toBeInstanceOf(DecisionModelUnavailableError);
    try {
      await model.decideBatch([group]);
    } catch (error) {
      expect(String(error)).not.toContain(config.apiKey);
    }
  });
});
