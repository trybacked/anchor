import { createGatewayProvider } from "@ai-sdk/gateway";
import type { ProfileReport, Proposal } from "@trybacked/core";
import { generateText, type LanguageModel } from "ai";
import {
  buildOntologyExtractUserPrompt,
  ONTOLOGY_EXTRACT_SYSTEM_PROMPT,
} from "./build-grounding-prompt.js";
import type { DocTableSample } from "./collect-samples.js";
import { ONTOLOGY_EXTRACT_TIMEOUT_MS } from "./extract-config.js";
import {
  ONTOLOGY_EXTRACT_OUTPUT_CONTRACT,
  OntologyExtractOutputError,
  parseOntologyExtractOutput,
  type OntologyExtractOutput,
} from "./extract-output.js";

export type OntologyExtractUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type ExtractOntologyWithLlmOptions = {
  model: LanguageModel;
  profile: ProfileReport;
  proposal: Proposal;
  samples: readonly DocTableSample[];
  localeHint?: string | undefined;
};

export type ExtractOntologyWithLlmResult = {
  output: OntologyExtractOutput;
  usage: OntologyExtractUsage;
};

export function createGatewayLanguageModel(apiKey: string, modelId: string): LanguageModel {
  const gateway = createGatewayProvider({ apiKey });
  return gateway(modelId);
}

export async function extractOntologyWithLlm(
  options: ExtractOntologyWithLlmOptions,
): Promise<ExtractOntologyWithLlmResult> {
  const system = [ONTOLOGY_EXTRACT_SYSTEM_PROMPT, ONTOLOGY_EXTRACT_OUTPUT_CONTRACT].join("\n\n");
  const prompt = buildOntologyExtractUserPrompt({
    profile: options.profile,
    proposal: options.proposal,
    samples: options.samples,
    localeHint: options.localeHint,
  });
  const generation = await generateText({
    model: options.model,
    system,
    prompt,
    temperature: 0,
    timeout: ONTOLOGY_EXTRACT_TIMEOUT_MS,
  });
  let output: OntologyExtractOutput;
  try {
    output = parseOntologyExtractOutput(generation.text);
  } catch (error) {
    if (error instanceof OntologyExtractOutputError) {
      throw error;
    }
    throw error;
  }
  return {
    output,
    usage: {
      inputTokens: generation.usage.inputTokens ?? 0,
      outputTokens: generation.usage.outputTokens ?? 0,
      totalTokens: generation.usage.totalTokens ?? 0,
    },
  };
}
