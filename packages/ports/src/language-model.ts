export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmStructuredRequest = {
  messages: LlmMessage[];
  schemaName: string;
  schema: unknown;
  temperature?: number;
  maxOutputTokens?: number;
};

export type LlmTextRequest = {
  messages: LlmMessage[];
  temperature?: number;
  maxOutputTokens?: number;
};

export type LlmUsage = {
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
};

export type LlmStructuredResult<T> = {
  value: T;
  modelId: string;
  usage: LlmUsage;
  cacheHit: boolean;
};

export type LanguageModel = {
  modelId: string;
  generateStructured<T>(request: LlmStructuredRequest): Promise<LlmStructuredResult<T>>;
  generateText(
    request: LlmTextRequest,
  ): Promise<{ text: string; usage: LlmUsage; cacheHit: boolean }>;
};
