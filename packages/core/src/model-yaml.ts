import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { SemanticModelSchema } from "./model.js";
import type { SemanticModel } from "./model.js";
import { workspacePaths } from "./workspace.js";

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
    }
    catch {
        throw new Error(`Missing model: ${path.basename(modelPath)} not found in ${root}. Run "backed model" and "backed review" first.`);
    }
    return parseModelYaml(raw);
}
