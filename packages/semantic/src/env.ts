/**
 * Model routing configuration from environment (.env supported by the CLI):
 * a cheap model for column classification, a frontier model for ambiguous
 * entities and business definitions. Missing key → clear error message.
 */

import { DEFAULT_REVIEW_CONFIDENCE_THRESHOLD } from "@backed/core";
import { createGateway } from "@ai-sdk/gateway";
import type { LanguageModel } from "ai";

export const AI_GATEWAY_API_KEY_ENV = "AI_GATEWAY_API_KEY";
export const CHEAP_MODEL_ENV = "SEMANTIC_MODEL_CHEAP";
export const FRONTIER_MODEL_ENV = "SEMANTIC_MODEL_FRONTIER";
export const REVIEW_CONFIDENCE_THRESHOLD_ENV = "REVIEW_CONFIDENCE_THRESHOLD";

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
        `Missing AI Gateway key: set ${AI_GATEWAY_API_KEY_ENV} in the environment or in a .env file.`,
        "How to fix:",
        "  1. Create a key at https://vercel.com/ai-gateway (or use your team's key).",
        `  2. Add to a .env file in your working directory: ${AI_GATEWAY_API_KEY_ENV}=<your-key>`,
        `Optional models: ${CHEAP_MODEL_ENV} (default ${DEFAULT_CHEAP_MODEL}), ${FRONTIER_MODEL_ENV} (default ${DEFAULT_FRONTIER_MODEL}).`,
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

export class InvalidReviewThresholdError extends Error {
  constructor(raw: string) {
    super(
      `${REVIEW_CONFIDENCE_THRESHOLD_ENV} must be a number between 0 and 1 (exclusive of 0). Got: ${raw}`,
    );
    this.name = "InvalidReviewThresholdError";
  }
}

export function resolveReviewConfidenceThreshold(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env[REVIEW_CONFIDENCE_THRESHOLD_ENV];
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_REVIEW_CONFIDENCE_THRESHOLD;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    throw new InvalidReviewThresholdError(raw);
  }

  return parsed;
}
