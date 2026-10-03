import { serializeModelYaml, type SemanticModel } from "@trybacked/core";
import { validateAuthoringModel } from "@trybacked/ontology-authoring";
import type { DatabricksProviderConfig } from "@trybacked/provider-databricks";
import { createDatabricksBlobStore } from "@trybacked/provider-databricks";
import { createDatabricksSqlClient } from "@trybacked/provider-databricks";
import { buildRemotePublication, createVolumeOntologyStore } from "@trybacked/registry";
import type pg from "pg";
import { sqlCellStringFromKeys } from "../authoring/sql-row.js";
import {
  getOntologyDraft,
  getLatestOntologyVersion,
  insertOntologyVersion,
} from "../db/ontology-repositories.js";

async function validateWarehouseMappings(
  config: DatabricksProviderConfig,
  model: SemanticModel,
): Promise<string[]> {
  const sqlClient = createDatabricksSqlClient(config);
  const errors: string[] = [];
  for (const entity of model.entities) {
    const parts = entity.sourceTable.split(".");
    if (parts.length < 3) {
      errors.push(`Entity ${entity.id}: sourceTable must be catalog.schema.table`);
      continue;
    }
    const [catalog, schema, table] = parts;
    if (catalog === undefined || schema === undefined || table === undefined) {
      continue;
    }
    const sql = `SELECT column_name FROM ${catalog}.information_schema.columns
      WHERE table_schema = '${schema.replace(/'/g, "''")}'
        AND table_name = '${table.replace(/'/g, "''")}'`;
    let columns: Set<string>;
    try {
      const rows = await sqlClient.execute(sql);
      columns = new Set(
        rows
          .map((row) => sqlCellStringFromKeys(row, ["column_name", "COLUMN_NAME"]))
          .filter(Boolean),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Entity ${entity.id}: cannot read columns for ${entity.sourceTable}: ${message}`);
      continue;
    }
    for (const property of entity.properties) {
      if (!columns.has(property.columnName)) {
        errors.push(
          `Entity ${entity.id}: column "${property.columnName}" missing on ${entity.sourceTable}`,
        );
      }
    }
  }
  return errors;
}

export async function runPublishOntologyJob(
  pool: pg.Pool,
  adminConfig: DatabricksProviderConfig,
  input: { tenantId: string; catalog: string; actor: string; notes?: string | undefined },
): Promise<{ version: number; artifactPath: string }> {
  const draft = await getOntologyDraft(pool, input.tenantId);
  if (draft === undefined) {
    throw new Error("No ontology draft to publish");
  }
  const validation = validateAuthoringModel(draft.model, input.tenantId);
  if (!validation.valid) {
    const message = validation.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.message)
      .join("; ");
    throw new Error(message.length > 0 ? message : "Draft validation failed");
  }
  const warehouseErrors = await validateWarehouseMappings(adminConfig, draft.model);
  if (warehouseErrors.length > 0) {
    throw new Error(warehouseErrors.join("; "));
  }
  const nextVersion = (await getLatestOntologyVersion(pool, input.tenantId)) + 1;
  const { record, modelYaml } = buildRemotePublication(draft.model, {
    ontologyId: input.tenantId,
    version: nextVersion,
  });
  const store = createVolumeOntologyStore(createDatabricksBlobStore(adminConfig));
  await store.publish(input.catalog, record, modelYaml);
  const artifactPath = `/Volumes/${input.catalog}/backed/registry/publications/v${String(nextVersion)}.json`;
  await insertOntologyVersion(pool, {
    tenant_id: input.tenantId,
    version: nextVersion,
    model: draft.model,
    ontology: record.ontology,
    published_by: input.actor,
    notes: input.notes ?? null,
    artifact_path: artifactPath,
  });
  return { version: nextVersion, artifactPath };
}

export function exportDraftYaml(model: SemanticModel): string {
  return serializeModelYaml(model);
}
