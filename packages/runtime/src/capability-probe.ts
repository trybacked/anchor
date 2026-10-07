import type { SqlStatementExecutor } from "./execute.js";
import type { DocumentsDatasetResolver } from "./readers/dataset.js";
export type WarehouseTableCapabilities = {
  documents: boolean;
  documentElements: boolean;
  entityProfiles: boolean;
};
async function tableExists(
  executor: SqlStatementExecutor,
  qualifiedTable: string,
): Promise<boolean> {
  try {
    await executor(`SELECT 1 FROM ${qualifiedTable} LIMIT 0`, []);
    return true;
  } catch {
    return false;
  }
}
export async function probeWarehouseTableCapabilities(
  executor: SqlStatementExecutor,
  documents: DocumentsDatasetResolver,
): Promise<WarehouseTableCapabilities> {
  const [documentsOk, elementsOk, profilesOk] = await Promise.all([
    tableExists(executor, documents.documentsTable),
    tableExists(executor, documents.documentElementsTable),
    tableExists(executor, documents.entityProfilesTable),
  ]);
  return {
    documents: documentsOk,
    documentElements: elementsOk,
    entityProfiles: profilesOk,
  };
}
export function warehouseReadersAvailable(caps: WarehouseTableCapabilities): boolean {
  return caps.documents && caps.documentElements;
}
export function missingWarehouseTablesMessage(
  caps: WarehouseTableCapabilities,
  tables?: { documents: string; documentElements: string },
): string {
  const missing: string[] = [];
  if (!caps.documents) {
    missing.push(tables?.documents ?? "documents dataset");
  }
  if (!caps.documentElements) {
    missing.push(tables?.documentElements ?? "document elements dataset");
  }
  if (missing.length === 0) {
    return "";
  }
  return `Missing docs tables: ${missing.join(", ")}. Run the docs pipeline refresh (docs_refresh job) for this catalog.`;
}
