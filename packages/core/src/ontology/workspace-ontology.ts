import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { MODEL_FORMAT_VERSION } from "../constants.js";
import { parseModelYaml } from "../model-yaml.js";
import type { SemanticModel } from "../model.js";
import { MODEL_YAML_FILENAME } from "./ontology-v2-yaml.js";
import { ONTOLOGY_FORMAT_VERSION_V2, OntologyV2Schema, type OntologyV2 } from "./spec-v2.js";

/**
 *
 */
export type WorkspaceModelFormat = "semantic_v1" | "ontology_v2";

/**
 *
 */
export type WorkspaceModel =
  { format: "semantic_v1"; model: SemanticModel } | { format: "ontology_v2"; ontology: OntologyV2 };

function detectFormatVersion(raw: unknown): WorkspaceModelFormat {
  if (typeof raw !== "object" || raw === null || !("metadata" in raw)) {
    throw new Error("model.yaml must contain a metadata block");
  }
  const metadata = raw.metadata;
  if (typeof metadata !== "object" || metadata === null || !("formatVersion" in metadata)) {
    throw new Error("model.yaml metadata.formatVersion is required");
  }
  const version = metadata.formatVersion;
  if (version === ONTOLOGY_FORMAT_VERSION_V2) {
    return "ontology_v2";
  }
  if (version === MODEL_FORMAT_VERSION) {
    return "semantic_v1";
  }
  throw new Error(`Unsupported model.yaml formatVersion: ${String(version)}`);
}

/**
 *
 */
export function readWorkspaceModel(root: string): WorkspaceModel {
  const filePath = path.join(root, MODEL_YAML_FILENAME);
  if (!existsSync(filePath)) {
    throw new Error(`No ${MODEL_YAML_FILENAME} at ${filePath}`);
  }
  const text = readFileSync(filePath, "utf8");
  const raw: unknown = parseYaml(text);
  const format = detectFormatVersion(raw);
  if (format === "ontology_v2") {
    return { format, ontology: OntologyV2Schema.parse(raw) };
  }
  return { format, model: parseModelYaml(text) };
}

/**
 *
 */
export function isOntologyV2Workspace(root: string): boolean {
  try {
    return readWorkspaceModel(root).format === "ontology_v2";
  } catch {
    return false;
  }
}
