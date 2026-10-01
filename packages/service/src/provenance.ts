import { compileObjectQuery } from "@trybacked/compiler";
import type { ObjectQuery } from "@trybacked/compiler";
import type { Ontology, OntologyObject } from "@trybacked/core";

/** First-class provenance chain: entity → row → document → page. */
export type DocumentProvenance = {
  documentId: string;
  page?: number | undefined;
  pageStart?: number | undefined;
  pageEnd?: number | undefined;
  documentType?: string | undefined;
  sourceFile?: string | undefined;
  filename?: string | undefined;
};

export type EntityProvenance = {
  objectId: string;
  objectName: string;
  sourceDatasetId?: string | undefined;
};

export type RowProvenance = {
  rowIndex: number;
  entity: EntityProvenance;
  row: Record<string, unknown>;
  document?: DocumentProvenance | undefined;
};

const DOCUMENT_ID_KEYS = ["document_id", "documentId"] as const;
const PAGE_START_KEYS = ["page_start", "pageStart", "page", "page_number"] as const;
const PAGE_END_KEYS = ["page_end", "pageEnd"] as const;
const DOCUMENT_TYPE_KEYS = ["document_type", "documentType", "doc_type", "elementType"] as const;
const SOURCE_FILE_KEYS = ["source_file", "sourceFile", "filename"] as const;

function readField(row: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (key in row) {
      return row[key];
    }
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return value.toString();
  }
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function resolveObject(ontology: Ontology, objectId: string): OntologyObject {
  const object = ontology.objects.find((candidate) => candidate.id === objectId);
  if (object === undefined) {
    throw new Error(`Object "${objectId}" not found for provenance.`);
  }
  return object;
}

function documentProvenanceFromRow(row: Record<string, unknown>): DocumentProvenance | undefined {
  const documentId = asString(readField(row, DOCUMENT_ID_KEYS));
  if (documentId === undefined) {
    return undefined;
  }
  const pageStart = asNumber(readField(row, PAGE_START_KEYS));
  const pageEnd = asNumber(readField(row, PAGE_END_KEYS));
  const documentType = asString(readField(row, DOCUMENT_TYPE_KEYS));
  const sourceFile = asString(readField(row, SOURCE_FILE_KEYS));
  return {
    documentId,
    ...(pageStart !== undefined ? { page: pageStart, pageStart } : {}),
    ...(pageEnd !== undefined ? { pageEnd } : {}),
    ...(documentType !== undefined ? { documentType } : {}),
    ...(sourceFile !== undefined ? { filename: sourceFile, sourceFile } : {}),
  };
}

export function buildRowProvenance(options: {
  ontology: Ontology;
  objectId: string;
  rows: Record<string, unknown>[];
}): RowProvenance[] {
  const object = resolveObject(options.ontology, options.objectId);
  const entity: EntityProvenance = {
    objectId: object.id,
    objectName: object.name,
    ...(object.sourceDatasetId !== undefined ? { sourceDatasetId: object.sourceDatasetId } : {}),
  };

  return options.rows.map((row, rowIndex) => {
    let document = documentProvenanceFromRow(row);
    if (object.id === "document_element" || object.id === "document") {
      const page = asNumber(readField(row, PAGE_START_KEYS));
      const filename = asString(readField(row, SOURCE_FILE_KEYS));
      const docId = asString(readField(row, DOCUMENT_ID_KEYS)) ?? "";
      document = {
        documentId: docId,
        ...(page !== undefined ? { page, pageStart: page } : {}),
        ...(filename !== undefined ? { filename, sourceFile: filename } : {}),
      };
    }
    return {
      rowIndex,
      entity,
      row,
      ...(document !== undefined && document.documentId.length > 0 ? { document } : {}),
    };
  });
}

export function buildQueryExecutionProvenance(options: {
  ontology: Ontology;
  objectQuery: ObjectQuery;
  rows: Record<string, unknown>[];
}): {
  sql: string;
  parameterNames: string[];
  provenance: RowProvenance[];
} {
  const compiled = compileObjectQuery(options.ontology, options.objectQuery);
  return {
    sql: compiled.sql,
    parameterNames: compiled.parameters.map((parameter) => parameter.name),
    provenance: buildRowProvenance({
      ontology: options.ontology,
      objectId: options.objectQuery.objectId,
      rows: options.rows,
    }),
  };
}

export function buildChunkSearchProvenance(rows: Record<string, unknown>[]): RowProvenance[] {
  return rows.map((row, rowIndex) => {
    const documentId = asString(row["documentId"] ?? row["document_id"]) ?? "";
    const page = asNumber(row["page"] ?? row["page_number"]);
    const filename = asString(row["filename"]);
    return {
      rowIndex,
      entity: {
        objectId: "document_element",
        objectName: "Document element",
      },
      row,
      ...(documentId.length > 0
        ? {
            document: {
              documentId,
              ...(page !== undefined ? { page, pageStart: page } : {}),
              ...(filename !== undefined ? { filename, sourceFile: filename } : {}),
            },
          }
        : {}),
    };
  });
}

export function buildGraphTraverseProvenance(rows: Record<string, unknown>[]): RowProvenance[] {
  return rows.map((row, rowIndex) => {
    const entityKey = Object.keys(row).find((key) => key.includes("."));
    const objectId = entityKey?.split(".")[0] ?? "graph_traverse";
    const objectName = objectId.replaceAll("_", " ");
    return {
      rowIndex,
      entity: { objectId, objectName },
      row,
      ...(documentProvenanceFromRow(row) !== undefined
        ? { document: documentProvenanceFromRow(row) }
        : {}),
    };
  });
}

export function buildEntityProfileProvenance(
  profile: {
    matches: { objectId: string; objectName: string; row: Record<string, unknown> }[];
  },
  ontology: Ontology,
): RowProvenance[] {
  return profile.matches.map((match, rowIndex) => {
    const object = ontology.objects.find((candidate) => candidate.id === match.objectId);
    return {
      rowIndex,
      entity: {
        objectId: match.objectId,
        objectName: match.objectName,
        ...(object?.sourceDatasetId !== undefined
          ? { sourceDatasetId: object.sourceDatasetId }
          : {}),
      },
      row: match.row,
      ...(documentProvenanceFromRow(match.row) !== undefined
        ? { document: documentProvenanceFromRow(match.row) }
        : {}),
    };
  });
}
