import type { SqlStatementExecutor } from "../execute.js";
import {
  DEFAULT_CHUNK_SEARCH_LIMIT,
  DEFAULT_CHUNK_SEARCH_MIN_SCORE,
  DEFAULT_EXCLUDED_ELEMENT_TYPES,
  MAX_CHUNK_SEARCH_LIMIT,
  RRF_CANDIDATE_MULTIPLIER,
} from "./constants.js";
import type { DocumentsDatasetResolver } from "./dataset.js";
import { reciprocalRankFusion, type RankedRow } from "./rrf.js";
import { toSqlLimitLiteral } from "./sql-limit-literal.js";
export type ChunkSearchInput = {
  query: string;
  limit?: number | undefined;
  minScore?: number | undefined;
  documentIds?: string[] | undefined;
  elementTypes?: string[] | undefined;
  excludeElementTypes?: string[] | undefined;
};
function elementRowId(row: Record<string, unknown>): string {
  const elementId = row["element_id"];
  return String(elementId);
}
function quoteIdentifier(identifier: string): string {
  return `\`${identifier.replaceAll("`", "``")}\``;
}
function normalizeChunkRow(row: Record<string, unknown>, score: number): Record<string, unknown> {
  return {
    elementId: row["element_id"],
    documentId: row["document_id"],
    filename: row["filename"],
    folder: row["folder"],
    page: row["page_number"],
    elementType: row["element_type"],
    elementIndex: row["element_index"],
    text: row["content"],
    score,
    ...(row["keywordRank"] !== undefined ? { keywordRank: row["keywordRank"] } : {}),
    ...(row["semanticRank"] !== undefined ? { semanticRank: row["semanticRank"] } : {}),
  };
}
function buildElementTypeFilter(
  includeTypes: string[] | undefined,
  excludeTypes: string[],
  parameters: {
    name: string;
    value: string | number | boolean;
  }[],
): string {
  const conditions: string[] = [];
  if (includeTypes !== undefined && includeTypes.length > 0) {
    const placeholders = includeTypes.map((_, index) => {
      const name = `etype${String(index)}`;
      parameters.push({ name, value: includeTypes[index] ?? "" });
      return `:${name}`;
    });
    conditions.push(`${quoteIdentifier("element_type")} IN (${placeholders.join(", ")})`);
  }
  if (excludeTypes.length > 0) {
    const placeholders = excludeTypes.map((_, index) => {
      const name = `xetype${String(index)}`;
      parameters.push({ name, value: excludeTypes[index] ?? "" });
      return `:${name}`;
    });
    conditions.push(`${quoteIdentifier("element_type")} NOT IN (${placeholders.join(", ")})`);
  }
  return conditions.length > 0 ? ` AND ${conditions.join(" AND ")}` : "";
}
async function fetchSemanticRankedList(options: {
  executor: SqlStatementExecutor;
  selectColumns: string;
  vectorSearchIndex: string;
  query: string;
  semLimit: number;
  minScore: number;
  documentIds: string[] | undefined;
  excludeTypes: string[];
}): Promise<RankedRow[] | undefined> {
  const {
    executor,
    selectColumns,
    vectorSearchIndex,
    query,
    semLimit,
    minScore,
    documentIds,
    excludeTypes,
  } = options;
  try {
    const semLimitLiteral = toSqlLimitLiteral(
      semLimit,
      MAX_CHUNK_SEARCH_LIMIT * RRF_CANDIDATE_MULTIPLIER,
    );
    const semanticSql = `SELECT ${selectColumns}, score
FROM vector_search(
  index => :vsIndex,
  query_text => :vsQuery,
  num_results => ${semLimitLiteral}
)`;
    const semanticRows = await executor(semanticSql, [
      { name: "vsIndex", value: vectorSearchIndex },
      { name: "vsQuery", value: query },
    ]);
    const filtered = semanticRows.filter((row) => {
      const score = row["score"];
      if (typeof score === "number" && score < minScore) {
        return false;
      }
      if (documentIds !== undefined && documentIds.length > 0) {
        const documentId = row["document_id"];
        return typeof documentId === "string" && documentIds.includes(documentId);
      }
      if (excludeTypes.length > 0) {
        const elementType = row["element_type"];
        if (typeof elementType === "string" && excludeTypes.includes(elementType)) {
          return false;
        }
      }
      return true;
    });
    return filtered.map((row, rank) => ({
      id: elementRowId(row),
      row: { ...row, semanticRank: rank + 1 },
    }));
  } catch {
    return undefined;
  }
}
export function createChunkSearchReader(options: {
  executor: SqlStatementExecutor;
  documents: DocumentsDatasetResolver;
  vectorSearchIndex?: string | undefined;
}): (input: ChunkSearchInput) => Promise<Record<string, unknown>[]> {
  const { executor, documents, vectorSearchIndex } = options;
  const table = documents.documentElementsTable;
  return async (input) => {
    const limit = Math.min(input.limit ?? DEFAULT_CHUNK_SEARCH_LIMIT, MAX_CHUNK_SEARCH_LIMIT);
    const minScore = input.minScore ?? DEFAULT_CHUNK_SEARCH_MIN_SCORE;
    const pattern = `%${input.query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    const excludeTypes = [...(input.excludeElementTypes ?? DEFAULT_EXCLUDED_ELEMENT_TYPES)];
    const lists: RankedRow[][] = [];
    const docFilter =
      input.documentIds !== undefined && input.documentIds.length > 0
        ? ` AND ${quoteIdentifier("document_id")} IN (${input.documentIds.map((_, index) => `:doc${String(index)}`).join(", ")})`
        : "";
    const docParams =
      input.documentIds?.map((documentId, index) => ({
        name: `doc${String(index)}`,
        value: documentId,
      })) ?? [];
    const typeParams: {
      name: string;
      value: string | number | boolean;
    }[] = [];
    const typeFilter = buildElementTypeFilter(input.elementTypes, excludeTypes, typeParams);
    const selectColumns = `${quoteIdentifier("element_id")}, ${quoteIdentifier("document_id")}, ${quoteIdentifier("filename")}, ${quoteIdentifier("folder")}, ${quoteIdentifier("element_type")}, ${quoteIdentifier("page_number")}, ${quoteIdentifier("element_index")}, ${quoteIdentifier("content")}`;
    const kwLimitLiteral = toSqlLimitLiteral(
      limit * RRF_CANDIDATE_MULTIPLIER,
      MAX_CHUNK_SEARCH_LIMIT * RRF_CANDIDATE_MULTIPLIER,
    );
    const keywordSql = `SELECT ${selectColumns}
FROM ${table}
WHERE LOWER(${quoteIdentifier("content")}) LIKE LOWER(:pattern)${docFilter}${typeFilter}
ORDER BY LENGTH(${quoteIdentifier("content")}) DESC
LIMIT ${kwLimitLiteral}`;
    const keywordRows = await executor(keywordSql, [
      { name: "pattern", value: pattern },
      ...docParams,
      ...typeParams,
    ]);
    lists.push(
      keywordRows.map((row, rank) => ({
        id: elementRowId(row),
        row: { ...row, keywordRank: rank + 1 },
      })),
    );
    if (vectorSearchIndex !== undefined && vectorSearchIndex.length > 0) {
      const semLimit = limit * 3;
      const semanticList = await fetchSemanticRankedList({
        executor,
        selectColumns,
        vectorSearchIndex,
        query: input.query,
        semLimit,
        minScore,
        documentIds: input.documentIds,
        excludeTypes,
      });
      if (semanticList !== undefined) {
        lists.push(semanticList);
      }
    }
    if (lists.length === 1) {
      return keywordRows.slice(0, limit).map((row) => normalizeChunkRow(row, 1));
    }
    const fused = reciprocalRankFusion(lists, limit);
    return fused.map((entry) =>
      normalizeChunkRow(entry.row as Record<string, unknown>, Number(entry.score)),
    );
  };
}
