import { isPipelineInfraDatasetTable } from "@trybacked/core";
import type { DocumentCatalog, ProfileReport } from "@trybacked/core";
import path from "node:path";

function sourceBasename(sourceFile: string): string {
  return path.basename(sourceFile);
}

function normalizeUnknownFiles(unknownFileNames: Iterable<string>): Set<string> {
  return new Set([...unknownFileNames].map((fileName) => sourceBasename(fileName)));
}

export function resolveTenantAffectedTables(
  profile: ProfileReport,
  unknownFileNames: Iterable<string>,
  documentCatalog?: DocumentCatalog,
): Set<string> {
  const unknown = normalizeUnknownFiles(unknownFileNames);
  const affected = new Set<string>();

  for (const table of profile) {
    if (isPipelineInfraDatasetTable(table.table)) {
      continue;
    }
    if (unknown.has(sourceBasename(table.sourceFile))) {
      affected.add(table.table);
    }
  }

  if (documentCatalog !== undefined) {
    const touchedTypeIds = new Set<string>();
    for (const document of documentCatalog.documents) {
      const fileRef = document.sourceFile ?? document.sourceTable;
      if (unknown.has(sourceBasename(fileRef))) {
        touchedTypeIds.add(document.documentType);
      }
    }
    for (const type of documentCatalog.documentTypes) {
      if (touchedTypeIds.has(type.id)) {
        affected.add(type.tableName);
      }
    }
  }

  return affected;
}
