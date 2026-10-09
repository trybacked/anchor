import { generateObject } from "ai";
import type { LanguageModel } from "ai";
import type { z } from "zod";

export type OntologyLlm = {
  generateObject: <T>(options: { schema: z.ZodType<T>; prompt: string }) => Promise<T>;
};

export function createAiSdkLlm(model: LanguageModel): OntologyLlm {
  return {
    generateObject: async <T>({ schema, prompt }: { schema: z.ZodType<T>; prompt: string }) => {

      const result = await generateObject({ model, schema, prompt });
      return result.object as T;
    },
  };
}
