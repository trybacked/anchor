import { parseModelYaml, serializeModelYaml, type SemanticModel } from "@trybacked/core";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const assetPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "assets",
  "minimal-shared-anac.model.yaml",
);

export function loadBootstrapModel(tenantId: string): SemanticModel {
  const text = readFileSync(assetPath, "utf8");
  const model = parseModelYaml(text);
  const runId = `tenant-${tenantId}-${Date.now().toString(36)}`;
  return {
    ...model,
    metadata: {
      ...model.metadata,
      runId,
      generatedAt: new Date().toISOString(),
    },
  };
}

export function bootstrapModelYaml(tenantId: string): string {
  return serializeModelYaml(loadBootstrapModel(tenantId));
}
