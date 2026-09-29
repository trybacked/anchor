import type { SemanticQueryTranslator } from "../engine.js";

export type OpenAiCompatibleTranslatorOptions = {
  url: string;
  apiKey?: string | undefined;
  model: string;
  fetch?: typeof fetch | undefined;
};

function readOpenAiMessageContent(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  const choices = record["choices"];
  if (!Array.isArray(choices)) {
    return undefined;
  }
  const first: unknown = choices[0];
  if (typeof first !== "object" || first === null) {
    return undefined;
  }
  const choice = first as Record<string, unknown>;
  const message = choice["message"];
  if (typeof message !== "object" || message === null) {
    return undefined;
  }
  const messageRecord = message as Record<string, unknown>;
  const content = messageRecord["content"];
  return typeof content === "string" ? content : undefined;
}

export function createOpenAiCompatibleTranslator(
  options: OpenAiCompatibleTranslatorOptions,
): SemanticQueryTranslator {
  const fetchFn = options.fetch ?? fetch;
  return async ({ prompt, ontologyContext }) => {
    const response = await fetchFn(options.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options.apiKey !== undefined ? { Authorization: `Bearer ${options.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: options.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Translate the user question into JSON matching SemanticQueryPlan. Use only ontology object and relationship ids from the context.",
          },
          { role: "user", content: `${ontologyContext}\n\n${prompt}` },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`LLM request failed: HTTP ${String(response.status)}`);
    }
    const payload: unknown = await response.json();
    const content = readOpenAiMessageContent(payload);
    if (content === undefined) {
      throw new Error("LLM response shape is not OpenAI-compatible.");
    }
    return content;
  };
}

export function createOpenAiCompatibleTranslatorFromEnv(
  env: NodeJS.ProcessEnv,
): SemanticQueryTranslator | undefined {
  const url = env["SEMANTIC_CHAT_LLM_URL"];
  const model = env["SEMANTIC_CHAT_LLM_MODEL"];
  if (url === undefined || model === undefined) {
    return undefined;
  }
  return createOpenAiCompatibleTranslator({
    url,
    model,
    apiKey: env["SEMANTIC_CHAT_LLM_KEY"],
  });
}
