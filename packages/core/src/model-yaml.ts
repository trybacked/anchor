import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { SemanticModelSchema } from "./model.js";
import type { SemanticModel } from "./model.js";
import { workspacePaths } from "./workspace.js";

/**
 * Serializes a semantic model to validated model.yaml text.
 *
 * @throws When the model fails schema validation.
 */
export function serializeModelYaml(model: SemanticModel): string {
  return stringifyYaml(SemanticModelSchema.parse(model));
}

/**
 * Parses model.yaml text into a validated {@link SemanticModel}.
 *
 * @throws When YAML is invalid or fails schema validation.
 */
export function parseModelYaml(text: string): SemanticModel {
  return SemanticModelSchema.parse(parseYaml(text));
}

/**
 * Writes model.yaml under the workspace `.backed/` directory.
 *
 * @returns Absolute path to the written file.
 */
export function writeModelYaml(root: string, model: SemanticModel): string {
  const { modelPath } = workspacePaths(root);
  writeFileSync(modelPath, serializeModelYaml(model), "utf-8");
  return modelPath;
}

/**
 * Reads model.yaml from a workspace root.
 *
 * @throws When the file is missing or invalid.
 */
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
