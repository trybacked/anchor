/**
 * Read/write of local artifacts (.backed/ and model.yaml).
 * Every read is Zod-validated: a corrupt artifact fails loudly, never silently.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { z } from "zod";

import { SemanticModelSchema } from "./model.js";
import type { SemanticModel } from "./model.js";
import { WorkspaceConfigSchema, workspacePaths } from "./workspace.js";
import type { RunArtifactName, WorkspaceConfig } from "./workspace.js";

export function initWorkspace(root: string, config: WorkspaceConfig): string {
  const paths = workspacePaths(root);
  mkdirSync(paths.runsDir, { recursive: true });
  writeFileSync(paths.configPath, stringifyYaml(WorkspaceConfigSchema.parse(config)), "utf-8");
  return paths.configPath;
}

export function readWorkspaceConfig(root: string): WorkspaceConfig {
  const paths = workspacePaths(root);
  let raw: string;
  try {
    raw = readFileSync(paths.configPath, "utf-8");
  } catch {
    throw new Error(
      `Workspace not initialized: missing ${paths.configPath}. Run "backed init" first.`,
    );
  }
  return WorkspaceConfigSchema.parse(parseYaml(raw));
}

export function writeRunArtifact(
  root: string,
  runId: string,
  artifact: RunArtifactName,
  data: unknown,
): string {
  const paths = workspacePaths(root);
  mkdirSync(paths.runDir(runId), { recursive: true });
  const filePath = paths.artifactPath(runId, artifact);
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  return filePath;
}

export function readRunArtifact<TSchema extends z.ZodTypeAny>(
  root: string,
  runId: string,
  artifact: RunArtifactName,
  schema: TSchema,
): z.infer<TSchema> {
  const filePath = workspacePaths(root).artifactPath(runId, artifact);
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    throw new Error(`Missing artifact: ${filePath}. Run "backed model" first.`);
  }
  return schema.parse(JSON.parse(raw)) as z.infer<TSchema>;
}

export function hasRunArtifact(root: string, runId: string, artifact: RunArtifactName): boolean {
  try {
    readFileSync(workspacePaths(root).artifactPath(runId, artifact), "utf-8");
    return true;
  } catch {
    return false;
  }
}

/** Run ids sorted ascending — ids are timestamp-prefixed, so lexicographic order is chronological. */
export function listRunIds(root: string): string[] {
  const paths = workspacePaths(root);
  try {
    return readdirSync(paths.runsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export function serializeModelYaml(model: SemanticModel): string {
  return stringifyYaml(SemanticModelSchema.parse(model));
}

export function parseModelYaml(text: string): SemanticModel {
  return SemanticModelSchema.parse(parseYaml(text));
}

export function writeModelYaml(root: string, model: SemanticModel): string {
  const { modelPath } = workspacePaths(root);
  writeFileSync(modelPath, serializeModelYaml(model), "utf-8");
  return modelPath;
}

export function readModelYaml(root: string): SemanticModel {
  const { modelPath } = workspacePaths(root);
  let raw: string;
  try {
    raw = readFileSync(modelPath, "utf-8");
  } catch {
    throw new Error(
      `Missing model: ${path.basename(modelPath)} not found in ${root}. Run "backed model" and "backed review" first.`,
    );
  }
  return parseModelYaml(raw);
}
