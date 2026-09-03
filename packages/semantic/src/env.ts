/**
 * Model routing configuration from environment (.env supported by the CLI):
 * a cheap model for column classification, a frontier model for ambiguous
 * entities and business definitions. Missing key → clear Italian error.
 */

import { createGateway } from "@ai-sdk/gateway";
import type { LanguageModel } from "ai";

export const AI_GATEWAY_API_KEY_ENV = "AI_GATEWAY_API_KEY";
export const CHEAP_MODEL_ENV = "SEMANTIC_MODEL_CHEAP";
export const FRONTIER_MODEL_ENV = "SEMANTIC_MODEL_FRONTIER";

export const DEFAULT_CHEAP_MODEL = "openai/gpt-5-mini";
export const DEFAULT_FRONTIER_MODEL = "anthropic/claude-sonnet-4.5";

export interface SemanticModels {
  cheap: LanguageModel;
  frontier: LanguageModel;
}

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      [
        `Chiave AI Gateway mancante: imposta ${AI_GATEWAY_API_KEY_ENV} nell'ambiente o in un file .env.`,
        "Come fare:",
        "  1. Crea una chiave su https://vercel.com/ai-gateway (o usa quella del tuo team).",
        `  2. Aggiungi al file .env nella cartella di lavoro: ${AI_GATEWAY_API_KEY_ENV}=<la-tua-chiave>`,
        `Modelli opzionali: ${CHEAP_MODEL_ENV} (default ${DEFAULT_CHEAP_MODEL}), ${FRONTIER_MODEL_ENV} (default ${DEFAULT_FRONTIER_MODEL}).`,
        'In alternativa esegui "backed model --no-llm" per fermarti alla profilazione, senza AI.',
      ].join("\n"),
    );
    this.name = "MissingApiKeyError";
  }
}

export function resolveSemanticModels(
  env: Record<string, string | undefined> = process.env,
): SemanticModels {
  const apiKey = env[AI_GATEWAY_API_KEY_ENV];
  if (!apiKey) {
    throw new MissingApiKeyError();
  }

  const gateway = createGateway({ apiKey });
  return {
    cheap: gateway(env[CHEAP_MODEL_ENV] ?? DEFAULT_CHEAP_MODEL),
    frontier: gateway(env[FRONTIER_MODEL_ENV] ?? DEFAULT_FRONTIER_MODEL),
  };
}
