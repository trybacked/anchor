export type DecisionQuestion =
  | { kind: "yesno"; id: string; question: string }
  | { kind: "tags"; id: string; question: string; tags: readonly string[] };

export type DecisionAnswer =
  | { kind: "yesno"; id: string; answer: boolean | null; probability: number }
  | {
      kind: "tags";
      id: string;
      tags: Record<string, { applies: boolean | null; probability: number }>;
    };

export type DecisionGroup = { content: string; questions: readonly DecisionQuestion[] };

export type DecisionGroupResult =
  { ok: true; answers: readonly DecisionAnswer[] } | { ok: false; error: string };

export type DecisionBatchResult = {
  modelId: string;
  groups: readonly DecisionGroupResult[];
  usage: { inputTokens: number; outputTokens: number; searches: number };
};

export type DecisionModel = {
  decideBatch(groups: readonly DecisionGroup[]): Promise<DecisionBatchResult>;
};

export type DecisionModelUnavailableReason =
  "auth" | "quota" | "unavailable" | "timeout" | "invalid_request";

export class DecisionModelUnavailableError extends Error {
  constructor(readonly reason: DecisionModelUnavailableReason) {
    super(reason);
    this.name = "DecisionModelUnavailableError";
  }
}
