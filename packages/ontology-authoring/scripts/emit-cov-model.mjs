#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { serializeModelYaml } from "@trybacked/core";
import { buildCovSemanticModel } from "../dist/packs/cov-model.js";

const catalog = process.argv[2] ?? "backed_gerace";
const outPath = process.argv[3];
if (outPath === undefined) {
  console.error("Usage: emit-cov-model.mjs <catalog> <output-model.yaml>");
  process.exit(1);
}

const model = buildCovSemanticModel(catalog, {
  runId: `foundry-doc-${catalog.replace(/\W/g, "-")}`,
  generatedAt: new Date().toISOString(),
});

writeFileSync(resolve(outPath), serializeModelYaml(model), "utf8");
console.error(`Wrote ${model.entities.length} entities, ${model.relations.length} relations → ${outPath}`);
