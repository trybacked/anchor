import { generateObject } from "ai";
import type { LanguageModel } from "ai";
import type { z } from "zod";

/**
 * LLM port for the ontology pipeline (Plan Phase 5).
 *
 * The pipeline depends on this interface, not on a specific AI SDK or model.
 * `createAiSdkLlm` adapts the Vercel AI SDK `generateObject` call; deployments
 * route the model from `tenant_settings.ai_model`.
 */
export type OntologyLlm = {
  generateObject: <T>(options: { schema: z.ZodType<T>; prompt: string }) => Promise<T>;
};

export function createAiSdkLlm(model: LanguageModel): OntologyLlm {
  return {
    generateObject: async <T,>({ schema, prompt }: { schema: z.ZodType<T>; prompt: string }) => {
      const result = await generateObject({ model, schema, prompt });
      return result.object as T;
    },
  };
}