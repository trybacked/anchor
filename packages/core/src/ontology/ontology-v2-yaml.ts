import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { validateOntologyV2 } from "./spec-v2-authoring.js";
import { OntologyV2Schema, type OntologyV2 } from "./spec-v2.js";

export const MODEL_YAML_FILENAME = "model.yaml";

/**
 *
 */
export function serializeOntologyV2Yaml(ontology: OntologyV2): string {
  return stringifyYaml(OntologyV2Schema.parse(ontology));
}

/**
 *
 */
export function parseOntologyV2Yaml(text: string): OntologyV2 {
  return OntologyV2Schema.parse(parseYaml(text));
}

/**
 *
 */
export function writeOntologyV2Yaml(root: string, ontology: OntologyV2): string {
  const filePath = path.join(root, MODEL_YAML_FILENAME);
  writeFileSync(filePath, serializeOntologyV2Yaml(ontology), "utf8");
  return filePath;
}

/**
 *
 */
export function readOntologyV2Yaml(root: string): OntologyV2 {
  const filePath = path.join(root, MODEL_YAML_FILENAME);
  if (!existsSync(filePath)) {
    throw new Error(`No ${MODEL_YAML_FILENAME} at ${filePath}`);
  }
  return parseOntologyV2Yaml(readFileSync(filePath, "utf8"));
}

/**
 *
 */
export function validateOntologyV2File(root: string): ReturnType<typeof validateOntologyV2> {
  const ontology = readOntologyV2Yaml(root);
  return validateOntologyV2(ontology);
}
