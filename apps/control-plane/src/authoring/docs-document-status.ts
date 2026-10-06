import type { DatasetProvider } from "@trybacked/core";
import type { DatabricksSqlClient } from "@trybacked/provider-databricks";

const DOCUMENTS_TABLE = "documents";
const DOCUMENT_ENTITIES_TABLE = "document_entities";

export type WarehouseDocumentStatusRow = {
  documentId: string;
  filename: string;
  folder: string | null;
  path: string | null;
  pageCount: number | null;
  entityCount: number;
};

function quoteIdentifier(identifier: string): string {
  return `\`${identifier.replaceAll("`", "``")}\``;
}

function stringField(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberField(row: Record<string, unknown>, key: string): number | undefined {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function mapWarehouseRow(row: Record<string, unknown>): WarehouseDocumentStatusRow | undefined {
  const documentId = stringField(row, "document_id");
  const filename = stringField(row, "filename");
  if (documentId === undefined || filename === undefined) {
    return undefined;
  }
  const folder = stringField(row, "folder") ?? null;
  const path = stringField(row, "path") ?? null;
  const pageCount = numberField(row, "page_count") ?? null;
  const entityCount = numberField(row, "entity_count") ?? 0;
  return {
    documentId,
    filename,
    folder,
    path,
    pageCount,
    entityCount,
  };
}

export async function listWarehouseDocumentExtractionStatus(
  provider: DatasetProvider,
  client: DatabricksSqlClient,
  catalog: string,
  schema: string,
): Promise<
  | { ok: true; documents: WarehouseDocumentStatusRow[] }
  | { ok: false; code: "docs_schema_empty"; missingTables: string[] }
> {
  const datasets = await provider.listDatasets();
  const tableNames = new Set(datasets.map((dataset) => dataset.id));
  if (!tableNames.has(DOCUMENTS_TABLE)) {
    return { ok: false, code: "docs_schema_empty", missingTables: [DOCUMENTS_TABLE] };
  }

  const catalogId = quoteIdentifier(catalog);
  const schemaId = quoteIdentifier(schema);
  const documentsTable = `${catalogId}.${schemaId}.${quoteIdentifier(DOCUMENTS_TABLE)}`;
  const hasEntityTable = tableNames.has(DOCUMENT_ENTITIES_TABLE);
  const entitiesTable = `${catalogId}.${schemaId}.${quoteIdentifier(DOCUMENT_ENTITIES_TABLE)}`;

  const entityJoin = hasEntityTable
    ? `LEFT JOIN (
  SELECT ${quoteIdentifier("document_id")}, COUNT(*) AS entity_count
  FROM ${entitiesTable}
  GROUP BY ${quoteIdentifier("document_id")}
) e ON d.${quoteIdentifier("document_id")} = e.${quoteIdentifier("document_id")}`
    : "";

  const entitySelect = hasEntityTable ? "COALESCE(e.entity_count, 0)" : "0";

  const sql = `SELECT
  d.${quoteIdentifier("document_id")},
  d.${quoteIdentifier("filename")},
  d.${quoteIdentifier("folder")},
  d.${quoteIdentifier("path")},
  d.${quoteIdentifier("page_count")},
  ${entitySelect} AS entity_count
FROM ${documentsTable} d
${entityJoin}
ORDER BY d.${quoteIdentifier("folder")}, d.${quoteIdentifier("filename")}`;

  const rows = await client.execute(sql);
  const documents = rows.flatMap((row) => {
    const mapped = mapWarehouseRow(row);
    return mapped !== undefined ? [mapped] : [];
  });
  return { ok: true, documents };
}
