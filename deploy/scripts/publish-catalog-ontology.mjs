#!/usr/bin/env node
/**
 * Publish a model.yaml into the shared ontology registry (filesystem or S3).
 *
 * Usage:
 *   BACKED_ONTOLOGY_REGISTRY_STORAGE=s3 BACKED_S3_BUCKET=backed-v1 \
 *     node deploy/scripts/publish-catalog-ontology.mjs \
 *       --catalog backed_gerace --tenant gerace --model path/to/model.yaml
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseModelYaml } from "@trybacked/core";
import { buildRemotePublication } from "@trybacked/registry";
import { createOntologyStoreFromEnv, ontologyRegistryLocationHint } from "@trybacked/infrastructure";

function parseArgs(argv) {
  const args = { catalog: "", tenant: "", model: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--catalog" && value !== undefined) {
      args.catalog = value;
      i += 1;
    } else if (key === "--tenant" && value !== undefined) {
      args.tenant = value;
      i += 1;
    } else if (key === "--model" && value !== undefined) {
      args.model = value;
      i += 1;
    }
  }
  if (args.catalog.length === 0 || args.tenant.length === 0 || args.model.length === 0) {
    throw new Error(
      "Usage: publish-catalog-ontology.mjs --catalog <catalog> --tenant <tenantId> --model <model.yaml>",
    );
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const modelPath = resolve(args.model);
const modelYaml = readFileSync(modelPath, "utf8");
const model = parseModelYaml(modelYaml);
const store = createOntologyStoreFromEnv(process.env);
const existing = await store.loadCurrent(args.catalog);
const version = (existing?.version ?? 0) + 1;
const { record } = buildRemotePublication(model, {
  ontologyId: args.tenant,
  version,
  provenance: {
    publishedBy: "publish-catalog-ontology.mjs",
    method: "publish",
  },
});
await store.publish(args.catalog, record, modelYaml);
console.log(
  JSON.stringify(
    {
      ok: true,
      catalog: args.catalog,
      tenant: args.tenant,
      version,
      registry: ontologyRegistryLocationHint(process.env),
    },
    null,
    2,
  ),
);
