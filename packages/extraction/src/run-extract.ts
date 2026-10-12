import { readWorkspaceModel } from "@trybacked/core";
import { PARSED_ARTIFACTS_DIR } from "@trybacked/ingest";
import {
  bindNamedParameters,
  createDuckDbSqlExecutor,
  duckDbExec,
  duckDbPathFromEnv,
  resolveWarehouseDuckDbPath,
} from "@trybacked/infrastructure";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { materializeOntologyTables } from "./materialize.js";
import { extractInstancesSpires } from "./spires-extract.js";

export type RunExtractStageOptions = {
  workspaceRoot: string;
  tenantId: string;
  env: NodeJS.ProcessEnv;
  duckDbPath?: string;
};

export type RunExtractStageResult = {
  duckDbPath: string;
  tablesCreated: number;
  instancesSeeded: number;
  verifiedRows: number;
};

type ParsedArtifact = {
  record: { relativePath: string; sha256: string };
  parsed: { uri: string; plainText: string; title?: string };
};

function quoteIdent(id: string): string {
  return `"${id.replaceAll('"', '""')}"`;
}

export async function runExtractStage(
  options: RunExtractStageOptions,
): Promise<RunExtractStageResult> {
  const workspace = readWorkspaceModel(options.workspaceRoot);
  if (workspace.format !== "ontology_v2") {
    throw new Error("extract requires OntologySpec v2 model.yaml — run `backed anchor migrate` first.");
  }
  const duckDbPath =
    options.duckDbPath ?? duckDbPathFromEnv(options.env) ?? resolveWarehouseDuckDbPath(options.env);
  await materializeOntologyTables(duckDbPath, workspace.ontology);

  const parsedDir = path.join(options.workspaceRoot, PARSED_ARTIFACTS_DIR);
  let instancesSeeded = 0;
  let verifiedRows = 0;
  const cacheDir = path.join(options.workspaceRoot, ".backed/llm-cache");

  if (existsSync(parsedDir)) {
    void createDuckDbSqlExecutor(duckDbPath);
    for (const name of readdirSync(parsedDir).filter((entry) => entry.endsWith(".json"))) {
      const artifact = JSON.parse(
        readFileSync(path.join(parsedDir, name), "utf8"),
      ) as ParsedArtifact;

      const docType = workspace.ontology.objectTypes.find((objectType) => objectType.id === "document");
      if (docType !== undefined) {
        const docSql = bindNamedParameters(
          `INSERT INTO docs.${quoteIdent(docType.id)} (uri, title, _evidence_uri) VALUES (:uri, :title, :evidence)`,
          {
            uri: artifact.parsed.uri,
            title: artifact.parsed.title ?? path.basename(artifact.parsed.uri),
            evidence: artifact.record.relativePath,
          },
        );
        await duckDbExec(duckDbPath, docSql);
        instancesSeeded += 1;
      }

      const rows = await extractInstancesSpires({
        ontology: workspace.ontology,
        plainText: artifact.parsed.plainText,
        evidenceUri: artifact.parsed.uri,
        env: options.env,
        cacheDir,
      });
      for (const row of rows) {
        verifiedRows += 1;
        const table = quoteIdent(row.objectTypeId);
        const keys = Object.keys(row.values);
        const columns = keys.map((key) => quoteIdent(key));
        const placeholders = keys.map((key) => `:${key}`);
        const params: Record<string, string> = { ...row.values, _evidence_uri: row.evidenceUri };
        const insertSql = bindNamedParameters(
          `INSERT INTO docs.${table} (${columns.join(", ")}, _evidence_uri) VALUES (${placeholders.join(", ")}, :_evidence_uri)`,
          params,
        );
        await duckDbExec(duckDbPath, insertSql);
        if (row.evidenceExcerpt !== null) {
          const evidenceSql = bindNamedParameters(
            `INSERT INTO docs.evidence (object_type, object_id, property_id, document_uri, excerpt)
             VALUES (:objectType, :objectId, :propertyId, :documentUri, :excerpt)`,
            {
              objectType: row.objectTypeId,
              objectId: row.values.name ?? row.objectTypeId,
              propertyId: "name",
              documentUri: row.evidenceUri,
              excerpt: row.evidenceExcerpt,
            },
          );
          await duckDbExec(duckDbPath, evidenceSql);
        }
        instancesSeeded += 1;
      }
    }
  }

  return {
    duckDbPath,
    tablesCreated: workspace.ontology.objectTypes.length + 1,
    instancesSeeded,
    verifiedRows,
  };
}
