import {
  createTenantArchiveFromEnv,
  documentIdFromVolumePath,
  type TenantArchive,
} from "../files/tenant-archive.js";
import { execCatalogWarehouseSql } from "./catalog-warehouse.js";

const DOCS_SCHEMA = "docs";

function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function qualifiedTable(catalog: string, table: string): string {
  return `${quoteIdent(catalog)}.${quoteIdent(DOCS_SCHEMA)}.${quoteIdent(table)}`;
}

function splitArchivePath(relativePath: string): { folder: string | null; filename: string } {
  const normalized = relativePath.replace(/^\/+/, "");
  const slash = normalized.lastIndexOf("/");
  if (slash <= 0) {
    return { folder: null, filename: normalized };
  }
  const folder = normalized.slice(0, slash);
  const filename = normalized.slice(slash + 1);
  return { folder: folder.length > 0 ? folder : null, filename };
}

function docTypeFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return "pdf";
  }
  if (lower.endsWith(".doc") || lower.endsWith(".docx")) {
    return "document";
  }
  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    return "text";
  }
  if (/\.(png|jpe?g|gif|webp)$/.test(lower)) {
    return "image";
  }
  return "other";
}

async function listAllArchiveFiles(archive: TenantArchive): Promise<
  Array<{
    relativePath: string;
    volumePath: string;
    documentId: string;
  }>
> {
  const records: Array<{ relativePath: string; volumePath: string; documentId: string }> = [];

  async function walk(folder?: string): Promise<void> {
    const listing = await archive.list(folder !== undefined ? { folder } : undefined);
    for (const entry of listing.entries) {
      if (entry.isDirectory) {
        const childFolder =
          folder !== undefined && folder.length > 0 ? `${folder}/${entry.name}` : entry.name;
        await walk(childFolder);
        continue;
      }
      const relativePath =
        folder !== undefined && folder.length > 0 ? `${folder}/${entry.name}` : entry.name;
      records.push({
        relativePath,
        volumePath: entry.path,
        documentId: entry.documentId ?? documentIdFromVolumePath(entry.path),
      });
    }
  }

  await walk(undefined);
  const byPath = new Map<string, (typeof records)[number]>();
  for (const record of records) {
    byPath.set(record.relativePath, record);
  }
  return [...byPath.values()];
}

async function ensureDocumentWarehouseTables(env: NodeJS.ProcessEnv, catalog: string): Promise<void> {
  const documents = qualifiedTable(catalog, "documents");
  const elements = qualifiedTable(catalog, "document_elements");
  const entities = qualifiedTable(catalog, "document_entities");
  const statements = [
    `CREATE SCHEMA IF NOT EXISTS ${quoteIdent(catalog)}.${quoteIdent(DOCS_SCHEMA)};`,
    `CREATE TABLE IF NOT EXISTS ${documents} (
      document_id VARCHAR PRIMARY KEY,
      filename VARCHAR NOT NULL,
      path VARCHAR NOT NULL,
      doc_type VARCHAR DEFAULT 'other',
      page_count INTEGER DEFAULT 0,
      folder VARCHAR,
      source_modified_at VARCHAR,
      file_size BIGINT
    );`,
    `CREATE TABLE IF NOT EXISTS ${elements} (
      element_id VARCHAR PRIMARY KEY,
      document_id VARCHAR,
      filename VARCHAR,
      folder VARCHAR,
      element_type VARCHAR,
      page_number INTEGER,
      element_index INTEGER,
      content VARCHAR
    );`,
    `CREATE TABLE IF NOT EXISTS ${entities} (
      document_id VARCHAR
    );`,
  ];
  for (const statement of statements) {
    await execCatalogWarehouseSql(env, catalog, statement);
  }
}

function escapeLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export async function syncDocumentArchiveToWarehouse(options: {
  env: NodeJS.ProcessEnv;
  tenantId: string;
  catalog: string;
  fullRefresh?: boolean | undefined;
}): Promise<{ indexed: number }> {
  const archive = createTenantArchiveFromEnv({
    env: options.env,
    tenantId: options.tenantId,
    catalog: options.catalog,
  });
  const files = await listAllArchiveFiles(archive);
  await ensureDocumentWarehouseTables(options.env, options.catalog);
  const documents = qualifiedTable(options.catalog, "documents");

  if (options.fullRefresh === true) {
    await execCatalogWarehouseSql(options.env, options.catalog, `DELETE FROM ${documents};`);
  }

  for (const file of files) {
    const { folder, filename } = splitArchivePath(file.relativePath);
    const docType = docTypeFromFilename(filename);
    const folderSql = folder === null ? "NULL" : escapeLiteral(folder);
    await execCatalogWarehouseSql(
      options.env,
      options.catalog,
      `INSERT OR REPLACE INTO ${documents} (
        document_id, filename, path, doc_type, page_count, folder
      ) VALUES (
        ${escapeLiteral(file.documentId)},
        ${escapeLiteral(filename)},
        ${escapeLiteral(file.volumePath)},
        ${escapeLiteral(docType)},
        0,
        ${folderSql}
      );`,
    );
  }

  return { indexed: files.length };
}
