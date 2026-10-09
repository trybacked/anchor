export type OntologyExtractModelConfig = {
  apiKey: string;
  modelId: string;
  fallbackModelId?: string | undefined;
};

export function createOntologyExtractModelFromEnv(
  env: NodeJS.ProcessEnv,
): OntologyExtractModelConfig | undefined {
  const apiKey = env["AI_GATEWAY_API_KEY"]?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    return undefined;
  }
  const modelId =
    env["ONTOLOGY_EXTRACT_MODEL"]?.trim() ??
    env["SEMANTIC_CHAT_MODEL"]?.trim() ??
    env["SEMANTIC_MODEL"]?.trim() ??
    "openai/gpt-4o-mini";
  const fallbackModelId = env["ONTOLOGY_EXTRACT_FALLBACK_MODEL"]?.trim();
  return {
    apiKey,
    modelId,
    ...(fallbackModelId !== undefined && fallbackModelId.length > 0 ? { fallbackModelId } : {}),
  };
}

export const DEFAULT_ONTOLOGY_EXTRACT_TIMEOUT_MS = 45_000;

export const ONTOLOGY_EXTRACT_TIMEOUT_MS = readTimeoutFromEnv(process.env);

function readTimeoutFromEnv(env: NodeJS.ProcessEnv): number {
  const raw = env["ONTOLOGY_EXTRACT_TIMEOUT_MS"]?.trim();
  if (raw === undefined || raw.length === 0) {
    return DEFAULT_ONTOLOGY_EXTRACT_TIMEOUT_MS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ONTOLOGY_EXTRACT_TIMEOUT_MS;
}
