import type { ObjectQuery } from "@trybacked/compiler";
import type { Ontology, SemanticModel } from "@trybacked/core";
import type { ObjectQueryResult, SqlStatementExecutor } from "../execute.js";
import type { ChunkSearchInput } from "./chunk-search.js";
import { toSqlLimitLiteral } from "./sql-limit-literal.js";
import {
  DEFAULT_PROFILE_DOCUMENT_LIMIT,
  DEFAULT_PROFILE_FACT_LIMIT,
  DEFAULT_PROFILE_MATCH_LIMIT,
  MAX_PROFILE_MATCH_LIMIT,
} from "./constants.js";
import type { DocumentsDatasetResolver } from "./dataset.js";
import type { GraphTraverseInput } from "./graph-traverse.js";

export type EntityProfileInput = {
  name: string;
  matchLimit?: number | undefined;
  factLimit?: number | undefined;
  documentLimit?: number | undefined;
  profileObjectIds?: string[] | undefined;
};

export type EntityProfileMatch = {
  objectId: string;
  objectName: string;
  row: Record<string, unknown>;
};

export type EntityProfileRelationCount = {
  relationId: string;
  direction: "forward" | "reverse";
  count: number;
};

export type EntityProfileDocumentHit = {
  documentId: string;
  filename?: string | undefined;
  pages: number[];
  snippet: string;
  hitCount: number;
};

export type EntityProfileResult = {
  query: string;
  matches: EntityProfileMatch[];
  relations: EntityProfileRelationCount[];
  documents: EntityProfileDocumentHit[];
  facts: Record<string, unknown>[];
};

type EntityProfileDeps = {
  ontology: Ontology;
  model: SemanticModel;
  executor: SqlStatementExecutor;
  documents: DocumentsDatasetResolver;
  entityProfilesAvailable: boolean;
  queryObjects: (query: ObjectQuery) => Promise<ObjectQueryResult>;
  graphTraverse: (input: GraphTraverseInput) => Promise<Record<string, unknown>[]>;
  chunkSearch: (input: ChunkSearchInput) => Promise<Record<string, unknown>[]>;
};

function quoteIdentifier(identifier: string): string {
  return `\`${identifier.replaceAll("`", "``")}\``;
}

function stringNameProperties(objectId: string, ontology: Ontology): string[] {
  const object = ontology.objects.find((candidate) => candidate.id === objectId);
  if (object === undefined) {
    return [];
  }
  return object.properties
    .filter((property) => property.type === "string")
    .map((property) => property.id);
}

function pickDisplayName(
  objectId: string,
  row: Record<string, unknown>,
  ontology: Ontology,
): string {
  const object = ontology.objects.find((candidate) => candidate.id === objectId);
  if (object === undefined) {
    return objectId;
  }
  for (const property of object.properties) {
    if (property.type !== "string") {
      continue;
    }
    const value = row[property.id];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return object.name;
}

function primaryKeyValue(
  row: Record<string, unknown>,
  objectId: string,
  ontology: Ontology,
): string | number | null {
  const object = ontology.objects.find((candidate) => candidate.id === objectId);
  const keyProp = object?.properties.find((property) => property.role === "primary_key");
  const keyId = keyProp?.id ?? "id";
  const value = row[keyId];
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  return null;
}

async function loadOptionalFacts(
  executor: SqlStatementExecutor,
  profilesTable: string,
  name: string,
  factLimit: number,
): Promise<Record<string, unknown>[]> {
  const pattern = `%${name.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  const sql = `SELECT *
FROM ${profilesTable}
WHERE LOWER(${quoteIdentifier("normalized_name")}) LIKE LOWER(:pattern)
   OR LOWER(${quoteIdentifier("name")}) LIKE LOWER(:pattern)
ORDER BY ${quoteIdentifier("mention_count")} DESC NULLS LAST
LIMIT ${toSqlLimitLiteral(factLimit, DEFAULT_PROFILE_FACT_LIMIT * 10)}`;
  try {
    return await executor(sql, [{ name: "pattern", value: pattern }]);
  } catch {
    return [];
  }
}

function groupDocumentHits(
  chunks: Record<string, unknown>[],
  documentLimit: number,
): EntityProfileDocumentHit[] {
  const byDoc = new Map<string, EntityProfileDocumentHit>();
  for (const chunk of chunks) {
    const documentId = chunk["documentId"];
    if (typeof documentId !== "string") {
      continue;
    }
    const page = chunk["page"];
    const pageNum = typeof page === "number" ? page : undefined;
    const text = chunk["text"];
    const snippet = typeof text === "string" ? text.slice(0, 240) : "";
    const existing = byDoc.get(documentId);
    if (existing === undefined) {
      byDoc.set(documentId, {
        documentId,
        filename: typeof chunk["filename"] === "string" ? chunk["filename"] : undefined,
        pages: pageNum !== undefined ? [pageNum] : [],
        snippet,
        hitCount: 1,
      });
      continue;
    }
    existing.hitCount += 1;
    if (pageNum !== undefined && !existing.pages.includes(pageNum)) {
      existing.pages.push(pageNum);
    }
    if (existing.snippet.length < snippet.length) {
      existing.snippet = snippet;
    }
  }
  return [...byDoc.values()]
    .sort((left, right) => right.hitCount - left.hitCount)
    .slice(0, documentLimit);
}

export function createEntityProfileReader(
  deps: EntityProfileDeps,
): (input: EntityProfileInput) => Promise<EntityProfileResult> {
  const {
    ontology,
    model,
    executor,
    documents,
    entityProfilesAvailable,
    queryObjects,
    graphTraverse,
    chunkSearch,
  } = deps;

  return async (input) => {
    const matchLimit = Math.min(
      input.matchLimit ?? DEFAULT_PROFILE_MATCH_LIMIT,
      MAX_PROFILE_MATCH_LIMIT,
    );
    const documentLimit = input.documentLimit ?? DEFAULT_PROFILE_DOCUMENT_LIMIT;
    const factLimit = input.factLimit ?? DEFAULT_PROFILE_FACT_LIMIT;

    const candidateObjectIds =
      input.profileObjectIds ??
      ontology.objects
        .filter((object) => stringNameProperties(object.id, ontology).length > 0)
        .map((object) => object.id);

    const matches: EntityProfileMatch[] = [];
    for (const objectId of candidateObjectIds) {
      if (matches.length >= matchLimit) {
        break;
      }
      const nameProps = stringNameProperties(objectId, ontology);
      if (nameProps.length === 0) {
        continue;
      }
      const result = await queryObjects({
        objectId,
        mode: "rows",
        limit: matchLimit,
        textSearch: { query: input.name, propertyIds: nameProps },
      });
      for (const row of result.rows) {
        if (matches.length >= matchLimit) {
          break;
        }
        matches.push({
          objectId,
          objectName: pickDisplayName(objectId, row, ontology),
          row,
        });
      }
    }

    const relations: EntityProfileRelationCount[] = [];
    for (const match of matches.slice(0, 3)) {
      const pk = primaryKeyValue(match.row, match.objectId, ontology);
      if (pk === null) {
        continue;
      }
      const entityRelations = model.relations.filter(
        (relation) =>
          relation.fromEntity === match.objectId || relation.toEntity === match.objectId,
      );
      for (const relation of entityRelations.slice(0, 8)) {
        const direction = relation.fromEntity === match.objectId ? "forward" : "reverse";
        const countRows = await graphTraverse({
          relationId: relation.id,
          value: pk,
          direction,
          depth: 1,
          limit: 1,
          mode: "count",
        });
        const countValue = countRows[0]?.["count"];
        relations.push({
          relationId: relation.id,
          direction,
          count: typeof countValue === "number" ? countValue : Number(countValue ?? 0),
        });
      }
    }

    const chunks = await chunkSearch({
      query: input.name,
      limit: documentLimit * 3,
    });
    const documentsGrouped = groupDocumentHits(chunks, documentLimit);

    const facts =
      entityProfilesAvailable && factLimit > 0
        ? await loadOptionalFacts(executor, documents.entityProfilesTable, input.name, factLimit)
        : [];

    return {
      query: input.name,
      matches,
      relations,
      documents: documentsGrouped,
      facts,
    };
  };
}
