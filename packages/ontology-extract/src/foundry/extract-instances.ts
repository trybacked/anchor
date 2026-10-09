import { generateText, type LanguageModel } from "ai";
import { ONTOLOGY_EXTRACT_TIMEOUT_MS } from "../extract-config.js";
import { collectPdfExcerpts, type CollectPdfExcerptsOptions } from "./collect-excerpts.js";
import {
  FOUNDRY_EXTRACT_OUTPUT_CONTRACT,
  parseFoundryExtractOutput,
  type FoundryExtractOutput,
} from "./output.js";
import {
  buildFoundryExtractUserPrompt,
  FOUNDRY_EXTRACT_SYSTEM_PROMPT,
  type DocumentExcerpt,
} from "./prompt.js";
import type { FoundryExtractUsage } from "./types.js";

export type { FoundryExtractUsage } from "./types.js";

export type ExtractFoundryInstancesOptions = {
  model: LanguageModel;
  documents: readonly DocumentExcerpt[];
  localeHint?: string | undefined;
  competencyQuestions?: readonly string[] | undefined;
};

export type ExtractFoundryInstancesResult = {
  output: FoundryExtractOutput;
  usage: FoundryExtractUsage;
};

export async function extractFoundryInstancesFromExcerpts(
  options: ExtractFoundryInstancesOptions,
): Promise<ExtractFoundryInstancesResult> {
  const system = [FOUNDRY_EXTRACT_SYSTEM_PROMPT, FOUNDRY_EXTRACT_OUTPUT_CONTRACT].join("\n\n");
  const prompt = buildFoundryExtractUserPrompt({
    documents: options.documents,
    localeHint: options.localeHint,
    competencyQuestions: options.competencyQuestions,
  });
  const generation = await generateText({
    model: options.model,
    system,
    prompt,
    temperature: 0,
    timeout: ONTOLOGY_EXTRACT_TIMEOUT_MS,
  });
  const output = parseFoundryExtractOutput(generation.text);
  return {
    output,
    usage: {
      inputTokens: generation.usage.inputTokens ?? 0,
      outputTokens: generation.usage.outputTokens ?? 0,
      totalTokens: generation.usage.totalTokens ?? 0,
    },
  };
}

export type RunFoundryExtractFromPdfRootOptions = CollectPdfExcerptsOptions & {
  model: LanguageModel;
  localeHint?: string | undefined;
  competencyQuestions?: readonly string[] | undefined;
};

export async function runFoundryExtractFromPdfRoot(
  options: RunFoundryExtractFromPdfRootOptions,
): Promise<ExtractFoundryInstancesResult & { documents: DocumentExcerpt[] }> {
  const documents = collectPdfExcerpts(options);
  const result = await extractFoundryInstancesFromExcerpts({
    model: options.model,
    documents,
    localeHint: options.localeHint,
    competencyQuestions: options.competencyQuestions,
  });
  return { ...result, documents };
}
