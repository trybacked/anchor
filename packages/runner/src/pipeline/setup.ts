import {
  MissingApiKeyError,
  resolveLanguageModelId,
  resolveSemanticModels,
} from "@backed/semantic";
import type { LlmCacheContext, SemanticModels } from "@backed/semantic";
import {
  createPipelineMaterializedDatasetTableSet,
  patchWorkspaceConfig,
  readWorkspaceConfig,
  workspacePaths,
} from "@trybacked/core";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import type { RunAnchorPipelineOptions } from "../types.js";
import { MissingSemanticModelsError } from "../types.js";

export const PIPELINE_DATASET_TABLES = createPipelineMaterializedDatasetTableSet();

export async function prepareLlmCache(root: string, forceFull: boolean): Promise<LlmCacheContext> {
  const { llmCacheDir } = workspacePaths(root);
  if (forceFull && existsSync(llmCacheDir)) {
    await rm(llmCacheDir, { recursive: true, force: true });
  }
  await mkdir(llmCacheDir, { recursive: true });
  return {
    cacheDir: llmCacheDir,
    modelId: resolveLanguageModelId(),
  };
}

export function resolveSourcesDir(root: string, sourcesDir: string | undefined): string {
  if (sourcesDir !== undefined) {
    patchWorkspaceConfig(root, { sourcesDir });
    return sourcesDir;
  }
  return readWorkspaceConfig(root).sourcesDir;
}

export function resolveModels(options: RunAnchorPipelineOptions): SemanticModels {
  if (options.models !== undefined) {
    return options.models;
  }
  try {
    return resolveSemanticModels(options.env ?? process.env);
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      throw new MissingSemanticModelsError(error);
    }
    throw error;
  }
}
