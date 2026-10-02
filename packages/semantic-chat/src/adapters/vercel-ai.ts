import { gateway, createGatewayProvider } from "@ai-sdk/gateway";
import { generateObject } from "ai";
import type { SemanticQueryTranslator } from "../engine.js";
import { RoutedSemanticPlanSchema } from "../plan-types.js";

const TRANSLATION_SYSTEM =
  "Translate the user question into JSON matching the routed semantic plan schema. " +
  "Use route single for warehouse queries; route template only for document-archive search flows. " +
  "Use only ontology object and relationship ids from the context. " +
  "Prefer mode count for how-many questions; keep row limits small.";

export type LlmUsageRecord = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type VercelAiTranslatorOptions = {
  modelId: string;

  apiKey?: string | undefined;

  usageSink?: ((usage: LlmUsageRecord) => void) | undefined;
};

function readUsage(usage: {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  totalTokens?: number | undefined;
}): LlmUsageRecord {
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
  };
}

export function createVercelAiTranslator(
  options: VercelAiTranslatorOptions,
): SemanticQueryTranslator {
  const model =
    options.apiKey !== undefined
      ? createGatewayProvider({ apiKey: options.apiKey })(options.modelId)
      : gateway(options.modelId);

  return async ({ prompt, ontologyContext }) => {
    const result = await generateObject({
      model,
      schema: RoutedSemanticPlanSchema,
      temperature: 0,
      system: TRANSLATION_SYSTEM,
      prompt: `${ontologyContext}\n\n${prompt}`,
    });
    options.usageSink?.(readUsage(result.usage));
    return JSON.stringify(result.object);
  };
}

export function createVercelAiTranslatorFromEnv(
  env: NodeJS.ProcessEnv,
): SemanticQueryTranslator | undefined {
  const modelId = env["SEMANTIC_CHAT_MODEL"] ?? env["SEMANTIC_MODEL"] ?? "openai/gpt-4o-mini";
  const apiKey = env["AI_GATEWAY_API_KEY"]?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    return undefined;
  }
  return createVercelAiTranslator({ modelId, apiKey });
}
