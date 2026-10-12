import type { LanguageModel, LlmStructuredRequest, LlmStructuredResult, LlmTextRequest } from "@trybacked/ports";
import { createHash } from "node:crypto";
import { gatewayPromptFromLlmMessages } from "./gateway-messages.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { z } from "zod";

export type GatewayLanguageModelOptions = {
  modelId: string;
  fallbackModelId?: string;
  cacheDir?: string;
  maxRetries?: number;
  apiKeyEnv?: string;
};

async function loadAiSdk() {
  const [{ createGateway }, { generateObject, generateText }] = await Promise.all([
    import("@ai-sdk/gateway"),
    import("ai"),
  ]);
  return { createGateway, generateObject, generateText };
}

function cacheKey(request: LlmStructuredRequest | LlmTextRequest, modelId: string): string {
  return createHash("sha256").update(JSON.stringify({ modelId, request })).digest("hex");
}

export function createGatewayLanguageModel(options: GatewayLanguageModelOptions): LanguageModel {
  const maxRetries = options.maxRetries ?? 2;
  const apiKeyEnv = options.apiKeyEnv ?? "AI_GATEWAY_API_KEY";
  const cacheDir = options.cacheDir;

  return {
    modelId: options.modelId,
    async generateStructured<T>(request: LlmStructuredRequest): Promise<LlmStructuredResult<T>> {
      const key = cacheKey(request, options.modelId);
      if (cacheDir !== undefined) {
        mkdirSync(cacheDir, { recursive: true });
        const cachePath = path.join(cacheDir, `${key}.json`);
        if (existsSync(cachePath)) {
          const cached = JSON.parse(readFileSync(cachePath, "utf8")) as LlmStructuredResult<T>;
          return { ...cached, cacheHit: true };
        }
      }
      const apiKey = process.env[apiKeyEnv]?.trim();
      if (apiKey === undefined || apiKey.length === 0) {
        throw new Error(`${apiKeyEnv} is required for LLM calls`);
      }
      const { createGateway, generateObject } = await loadAiSdk();
      const gateway = createGateway({ apiKey });
      const schema = request.schema as z.ZodType<T>;
      let lastError: unknown;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const modelId = attempt > 0 && options.fallbackModelId ? options.fallbackModelId : options.modelId;
        try {
          const prompt = gatewayPromptFromLlmMessages(request.messages);
          const result = await generateObject({
            model: gateway(modelId),
            schema,
            schemaName: request.schemaName,
            ...prompt,
            temperature: request.temperature ?? 0,
          });
          const payload: LlmStructuredResult<T> = {
            value: result.object,
            modelId,
            usage: {
              inputTokens: result.usage?.inputTokens ?? 0,
              outputTokens: result.usage?.outputTokens ?? 0,
              costUsd: null,
            },
            cacheHit: false,
          };
          if (cacheDir !== undefined) {
            writeFileSync(path.join(cacheDir, `${key}.json`), JSON.stringify(payload), "utf8");
          }
          return payload;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    },
    async generateText(request: LlmTextRequest) {
      const apiKey = process.env[apiKeyEnv]?.trim();
      if (apiKey === undefined || apiKey.length === 0) {
        throw new Error(`${apiKeyEnv} is required for LLM calls`);
      }
      const { createGateway, generateText } = await loadAiSdk();
      const gateway = createGateway({ apiKey });
      const prompt = gatewayPromptFromLlmMessages(request.messages);
      const result = await generateText({
        model: gateway(options.modelId),
        ...prompt,
        temperature: request.temperature ?? 0,
      });
      return {
        text: result.text,
        usage: {
          inputTokens: result.usage?.inputTokens ?? 0,
          outputTokens: result.usage?.outputTokens ?? 0,
          costUsd: null,
        },
        cacheHit: false,
      };
    },
  };
}
