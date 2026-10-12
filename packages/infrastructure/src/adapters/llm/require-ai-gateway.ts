const AI_GATEWAY_API_KEY_ENV = "AI_GATEWAY_API_KEY";

export function requireAiGatewayApiKey(env: NodeJS.ProcessEnv): string {
  const apiKey = env[AI_GATEWAY_API_KEY_ENV]?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error(
      `${AI_GATEWAY_API_KEY_ENV} is required — ontology induction and extraction are AI-only (no deterministic fallback).`,
    );
  }
  return apiKey;
}
