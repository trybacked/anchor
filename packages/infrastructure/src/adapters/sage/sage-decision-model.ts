import type {
  DecisionAnswer,
  DecisionBatchResult,
  DecisionGroup,
  DecisionGroupResult,
  DecisionModel,
  DecisionQuestion,
} from "@trybacked/ports";
import { DecisionModelUnavailableError } from "@trybacked/ports";
import { z } from "zod";
import { sageTagLabel } from "./risk-tag-labels.js";
import type { SageConfig } from "./sage-config.js";

const SageYesNoAnswerSchema = z.object({
  answer: z.enum(["yes", "no"]).nullable(),
  probability: z.number(),
});

const SageTagEntrySchema = z.object({
  id: z.string(),
  applies: z.boolean().nullable(),
  probability: z.number(),
});

const SageAnswerResultSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string(),
    kind: z.literal("yesno"),
    result: SageYesNoAnswerSchema,
    meta: z.object({ model: z.string().optional() }).passthrough().optional(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal("tags"),
    result: z.object({ tags: z.array(SageTagEntrySchema) }),
    meta: z.object({ model: z.string().optional() }).passthrough().optional(),
  }),
]);

const SageBatchAnswerSchema = z.object({
  ok: z.boolean(),
  result: SageAnswerResultSchema.optional(),
  error: z.string().nullish(),
});

const SageBatchGroupSchema = z.object({
  answers: z.array(SageBatchAnswerSchema),
});

const SageBatchResponseSchema = z.object({
  results: z.array(SageBatchGroupSchema),
  meta: z
    .object({
      model: z.string().optional(),
      usage: z
        .object({
          input_tokens: z.number().optional(),
          output_tokens: z.number().optional(),
          searches: z.number().optional(),
        })
        .optional(),
    })
    .passthrough(),
});

function mapQuestionToSage(question: DecisionQuestion): Record<string, unknown> {
  switch (question.kind) {
    case "yesno":
      return {
        id: question.id,
        kind: "yesno",
        instructions: question.question,
      };
    case "tags":
      return {
        id: question.id,
        kind: "tags",
        instructions: question.question,
        tags: question.tags.map((tag) => ({ id: tag, name: sageTagLabel(tag) })),
      };
    default: {
      const _exhaustive: never = question;
      throw new Error(`Unhandled question kind: ${String(_exhaustive)}`);
    }
  }
}

function mapYesNoAnswer(id: string, result: z.infer<typeof SageYesNoAnswerSchema>): DecisionAnswer {
  let answer: boolean | null = null;
  if (result.answer === "yes") {
    answer = true;
  } else if (result.answer === "no") {
    answer = false;
  }
  return { kind: "yesno", id, answer, probability: result.probability };
}

function mapTagsAnswer(id: string, tags: z.infer<typeof SageTagEntrySchema>[]): DecisionAnswer {
  const record: Record<string, { applies: boolean | null; probability: number }> = {};
  for (const tag of tags) {
    record[tag.id] = { applies: tag.applies, probability: tag.probability };
  }
  return { kind: "tags", id, tags: record };
}

function mapHttpStatusToReason(status: number): DecisionModelUnavailableError["reason"] {
  switch (status) {
    case 400:
      return "invalid_request";
    case 401:
      return "auth";
    case 402:
      return "quota";
    case 503:
    case 504:
      return "unavailable";
    default:
      return "unavailable";
  }
}

function parseGroupAnswers(
  rawAnswers: z.infer<typeof SageBatchAnswerSchema>[],
): DecisionGroupResult {
  const answers: DecisionAnswer[] = [];
  for (const entry of rawAnswers) {
    if (!entry.ok || entry.result === undefined) {
      return { ok: false, error: entry.error ?? "sage_answer_failed" };
    }
    const result = entry.result;
    switch (result.kind) {
      case "yesno":
        answers.push(mapYesNoAnswer(result.id, result.result));
        break;
      case "tags":
        answers.push(mapTagsAnswer(result.id, result.result.tags));
        break;
      default: {
        const _exhaustive: never = result;
        throw new Error(`Unhandled sage result kind: ${String(_exhaustive)}`);
      }
    }
  }
  return { ok: true, answers };
}

export function createSageDecisionModel(config: SageConfig): DecisionModel {
  return {
    async decideBatch(groups: readonly DecisionGroup[]): Promise<DecisionBatchResult> {
      const url = `${config.baseUrl.replace(/\/$/, "")}/decide/batch`;
      const body = {
        reasoning: config.reasoning,
        requests: groups.map((group) => ({
          content: group.content,
          questions: group.questions.map((question) => mapQuestionToSage(question)),
        })),
      };

      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") {
          throw new DecisionModelUnavailableError("timeout");
        }
        throw new DecisionModelUnavailableError("unavailable");
      }

      if (!response.ok) {
        throw new DecisionModelUnavailableError(mapHttpStatusToReason(response.status));
      }

      const json: unknown = await response.json();
      const parsed = SageBatchResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new DecisionModelUnavailableError("invalid_request");
      }

      const modelId = parsed.data.meta.model ?? "levanto-sage";
      const usage = parsed.data.meta.usage;
      const mappedGroups = parsed.data.results.map((group) => parseGroupAnswers(group.answers));

      return {
        modelId,
        groups: mappedGroups,
        usage: {
          inputTokens: usage?.input_tokens ?? 0,
          outputTokens: usage?.output_tokens ?? 0,
          searches: usage?.searches ?? 0,
        },
      };
    },
  };
}
