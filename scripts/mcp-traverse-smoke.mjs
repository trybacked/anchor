#!/usr/bin/env node
/**
 * MCP traverse smoke: query_entity + traverse_relation against a confirmed model.yaml.
 * Usage: node scripts/mcp-traverse-smoke.mjs [workspaceRoot]
 * Default workspaceRoot: ./test (Gerace workspace when present).
 */

import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const root = resolve(process.argv[2] ?? "test");
const modelPath = join(root, "model.yaml");

if (!existsSync(modelPath)) {
  console.error(`model.yaml not found at ${modelPath}`);
  process.exit(1);
}

const { readModelYaml, workspacePaths } = await import(
  pathToFileURL(join(repoRoot, "packages/core/dist/index.js")).href
);
const { createRowReader, createChunkSearcher, openDataSession } = await import(
  pathToFileURL(join(repoRoot, "packages/ingest/dist/index.js")).href
);
const { queryEntityRows, traverseRelationRows } = await import(
  pathToFileURL(join(repoRoot, "packages/mcp/dist/index.js")).href
);

const model = readModelYaml(root);
const paths = workspacePaths(root);
const session = await openDataSession(paths.dataPath);
const rowReader = createRowReader(session.query);
const chunkSearcher = createChunkSearcher(session.query);

const documentEntity =
  model.entities.find((entity) => entity.id.includes("determination")) ??
  model.entities.find((entity) => entity.sourceTable.startsWith("doc_"));

if (!documentEntity) {
  console.error("No document-type entity found in model.yaml");
  process.exit(1);
}

const entityQuery = await queryEntityRows(
  model,
  rowReader,
  { id: documentEntity.id, limit: 3 },
  { chunkSearcher },
);
console.log("query_entity:", JSON.stringify(entityQuery, null, 2));

const chunkRelation = model.relations.find(
  (relation) =>
    relation.fromEntity === documentEntity.id || relation.toEntity === "document_chunk",
);

if (chunkRelation) {
  const sampleRow = entityQuery.ok ? entityQuery.rows[0] : undefined;
  const documentIdColumn = documentEntity.properties.find(
    (property) => property.columnName === "document_id",
  )?.columnName;
  const sampleValue = sampleRow && documentIdColumn ? sampleRow[documentIdColumn] : undefined;

  if (sampleValue !== undefined) {
    const traverse = await traverseRelationRows(model, rowReader, {
      relationId: chunkRelation.id,
      value: String(sampleValue),
    });
    console.log("traverse_relation:", JSON.stringify(traverse, null, 2));
  } else {
    console.log("traverse_relation: skipped (no sample document_id)");
  }
} else {
  console.log("traverse_relation: skipped (no chunk relation in model)");
}

session.close();
