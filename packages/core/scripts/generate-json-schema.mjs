#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { SemanticModelSchema } from "../dist/model.js";
import { MODEL_FORMAT_VERSION } from "../dist/constants.js";

const ANCHOR_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const OUTPUT_PATH = join(ANCHOR_ROOT, "schema/anchor-schema-v1.json");

const modelSchema = zodToJsonSchema(SemanticModelSchema, {
    name: "AnchorSemanticModel",
    target: "jsonSchema7",
    $refStrategy: "none",
});

const document = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://anchor.dev/schema/anchor-schema-v1.json",
    title: "Anchor Semantic Model",
    description: "Versioned protocol artifact (model.yaml). Normative human-readable spec: docs/MODEL-FORMAT-v1.md",
    formatVersion: MODEL_FORMAT_VERSION,
    ...modelSchema,
};

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(document, null, 2)}\n`);
console.log(`Wrote ${OUTPUT_PATH}`);
