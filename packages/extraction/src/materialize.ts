import type { OntologyV2 } from "@trybacked/core";
import { duckDbExec, ensureWarehouseDuckDbParentDir } from "@trybacked/infrastructure";

function quoteIdent(id: string): string {
  return `"${id.replaceAll('"', '""')}"`;
}

export async function materializeOntologyTables(
  duckDbPath: string,
  ontology: OntologyV2,
): Promise<void> {
  ensureWarehouseDuckDbParentDir(duckDbPath);
  await duckDbExec(duckDbPath, "CREATE SCHEMA IF NOT EXISTS docs;");
  for (const objectType of ontology.objectTypes) {
    const table = quoteIdent(objectType.id);
    const columns = objectType.properties
      .filter((property) => property.kind === "physical")
      .map((property) => `${quoteIdent(property.id)} VARCHAR`);
    const ddl =
      columns.length > 0
        ? `CREATE TABLE IF NOT EXISTS docs.${table} (${columns.join(", ")}, _evidence_uri VARCHAR);`
        : `CREATE TABLE IF NOT EXISTS docs.${table} (_id VARCHAR PRIMARY KEY, _evidence_uri VARCHAR);`;
    await duckDbExec(duckDbPath, ddl);
  }
  await duckDbExec(
    duckDbPath,
    `CREATE TABLE IF NOT EXISTS docs.evidence (
      object_type VARCHAR,
      object_id VARCHAR,
      property_id VARCHAR,
      document_uri VARCHAR,
      char_start INTEGER,
      char_end INTEGER,
      excerpt VARCHAR
    );`,
  );
}
