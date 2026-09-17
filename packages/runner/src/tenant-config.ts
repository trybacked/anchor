import {
  DocumentTypeHintsSchema,
  DomainVocabularySchema,
  EMPTY_DOCUMENT_TYPE_HINTS,
} from "@trybacked/core";
import type { DocumentTypeHintConfig, DomainVocabulary } from "@trybacked/core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const TENANT_PIPELINE_CONFIG_FILE_NAME = "pipeline-config.json";

export const TenantPipelineConfigSchema = z.object({
  documentTypeHints: DocumentTypeHintsSchema.default(EMPTY_DOCUMENT_TYPE_HINTS),
  domain: DomainVocabularySchema.partial().optional(),
});

export type TenantPipelineConfig = z.infer<typeof TenantPipelineConfigSchema>;

export const TenantPipelineConfigPatchSchema = z
  .object({
    documentTypeHints: DocumentTypeHintsSchema.optional(),
    domain: DomainVocabularySchema.partial().optional(),
  })
  .refine((value) => value.documentTypeHints !== undefined || value.domain !== undefined, {
    message: "At least one config field is required",
  });

export type TenantPipelineConfigPatch = z.infer<typeof TenantPipelineConfigPatchSchema>;

export function tenantConfigPath(persistDir: string): string {
  return path.join(persistDir, TENANT_PIPELINE_CONFIG_FILE_NAME);
}

export function readTenantPipelineConfig(persistDir: string): TenantPipelineConfig {
  const configPath = tenantConfigPath(persistDir);
  if (!existsSync(configPath)) {
    return { documentTypeHints: EMPTY_DOCUMENT_TYPE_HINTS, domain: undefined };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
  } catch {
    throw new Error(`Invalid tenant pipeline config at ${configPath}`);
  }

  return TenantPipelineConfigSchema.parse(parsed);
}

export function writeTenantPipelineConfig(
  persistDir: string,
  config: TenantPipelineConfig,
): string {
  mkdirSync(persistDir, { recursive: true });
  const configPath = tenantConfigPath(persistDir);
  const normalized = TenantPipelineConfigSchema.parse(config);
  writeFileSync(configPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return configPath;
}

export function patchTenantPipelineConfig(
  persistDir: string,
  patch: TenantPipelineConfigPatch,
): TenantPipelineConfig {
  const existing = readTenantPipelineConfig(persistDir);
  const next: TenantPipelineConfig = {
    documentTypeHints: patch.documentTypeHints ?? existing.documentTypeHints,
    domain: patch.domain ?? existing.domain,
  };
  writeTenantPipelineConfig(persistDir, next);
  return next;
}

export function resolveTenantPipelineConfig(
  persistDir: string,
  runOverride?: TenantPipelineConfigPatch,
): TenantPipelineConfig {
  const persisted = readTenantPipelineConfig(persistDir);
  if (runOverride === undefined) {
    return persisted;
  }

  return {
    documentTypeHints: runOverride.documentTypeHints ?? persisted.documentTypeHints,
    domain: runOverride.domain ?? persisted.domain,
  };
}

export type { DocumentTypeHintConfig, DomainVocabulary };
