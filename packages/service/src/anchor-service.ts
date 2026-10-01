import { ObjectQueryCompileError, ObjectQuerySchema } from "@trybacked/compiler";
import type { Ontology } from "@trybacked/core";
import type { SemanticModel } from "@trybacked/core";
import type { OntologyQueryRuntime } from "@trybacked/runtime";
import { hashSql, type AnchorOperationAuditHook } from "./audit.js";
import type {
  ChunkSearchBody,
  EntityProfileBody,
  EntitySearchBody,
  GraphTraverseBody,
  ObjectQueryBody,
} from "./contracts.js";
import {
  applyQueryExecutionBudget,
  QueryExecutionBudgetError,
  type ExecutionBudgetProfile,
} from "./execution-budget.js";
import {
  getDefinition,
  getEntity,
  listEntities,
  listRelations,
  searchModel,
  type SearchModelOptions,
} from "./mapping.js";
import {
  buildChunkSearchProvenance,
  buildEntityProfileProvenance,
  buildGraphTraverseProvenance,
  buildQueryExecutionProvenance,
} from "./provenance.js";
import { capQueryObjectsPayload } from "./response-cap.js";
import type {
  DocumentPreviewFile,
  DocumentPreviewResponse,
  GetDocumentResponse,
} from "./responses.js";
import { serviceError, type ServiceErrorResult } from "./service-error.js";

export type { ServiceErrorResult } from "./service-error.js";

export type AnchorServiceOptions = {
  model: SemanticModel;
  ontology?: Ontology | undefined;
  queryRuntime?: OntologyQueryRuntime | undefined;
  searchModelOptions?: SearchModelOptions | undefined;
  onOperation?: AnchorOperationAuditHook | undefined;
  auditPrincipal?: string | undefined;
  executionProfile?: ExecutionBudgetProfile | undefined;
};

function auditOperation(
  options: AnchorServiceOptions,
  event: Parameters<AnchorOperationAuditHook>[0],
): void {
  options.onOperation?.({
    ...event,
    ...(options.auditPrincipal !== undefined ? { principal: options.auditPrincipal } : {}),
  });
}

function emptyProvenanceWhenNoOntology(): [] {
  return [];
}

export function createAnchorService(options: AnchorServiceOptions) {
  const { model, ontology, queryRuntime, searchModelOptions, executionProfile = "api" } = options;

  const hasChunkSearch = queryRuntime?.chunkSearch !== undefined;
  const hasEntityProfile = queryRuntime?.entityProfile !== undefined;
  const hasGraphTraverse = queryRuntime?.graphTraverse !== undefined;
  const hasDocumentAccess = queryRuntime?.documentAccess !== undefined;
  const hasDocumentPreview =
    queryRuntime !== undefined &&
    queryRuntime.documentAccess !== undefined &&
    queryRuntime.volumeFileAccess === true;

  return {
    listEntities: () => listEntities(model),

    getEntity: (id: string) => {
      const detail = getEntity(model, id);
      if (detail === null) {
        return serviceError("not_found", `Entity "${id}" not found.`);
      }
      return detail;
    },

    listRelations: (entityId?: string) => listRelations(model, entityId),

    searchModel: (query: string) => searchModel(model, query, searchModelOptions ?? {}),

    getDefinition: (term: string) => getDefinition(model, term),

    entitySearch: async (body: EntitySearchBody) => {
      const matches = await searchModel(model, body.query, searchModelOptions ?? {});
      if (body.kinds === undefined || body.kinds.length === 0) {
        return { matches };
      }
      const allowed = new Set(body.kinds);
      return { matches: matches.filter((match) => allowed.has(match.kind)) };
    },

    objectQuery: async (input: ObjectQueryBody | Record<string, unknown>) => {
      if (queryRuntime === undefined) {
        return serviceError(
          "unavailable",
          "Object queries are unavailable: no published ontology or warehouse.",
        );
      }
      const parsed = ObjectQuerySchema.safeParse(input);
      if (!parsed.success) {
        return serviceError(
          "bad_request",
          `Invalid query: ${parsed.error.issues[0]?.message ?? "bad input"}`,
        );
      }
      const started = Date.now();
      try {
        const mode = parsed.data.mode;
        const query = applyQueryExecutionBudget(parsed.data, executionProfile);
        const result = await queryRuntime.queryObjects(query);
        auditOperation(options, {
          operation: "objectQuery",
          objectId: result.objectId,
          mode,
          rowCount: result.rowCount,
          durationMs: Date.now() - started,
          sqlHash: hashSql(result.sql),
        });
        const executionMeta =
          ontology !== undefined
            ? buildQueryExecutionProvenance({
                ontology,
                objectQuery: query,
                rows: result.rows,
              })
            : { sql: result.sql, provenance: emptyProvenanceWhenNoOntology(), parameterNames: [] };
        return capQueryObjectsPayload({
          objectId: result.objectId,
          columns: result.columns,
          rows: result.rows,
          rowCount: result.rowCount,
          mode,
          sql: executionMeta.sql,
          provenance: executionMeta.provenance,
        });
      } catch (error) {
        if (
          error instanceof ObjectQueryCompileError ||
          error instanceof QueryExecutionBudgetError
        ) {
          return serviceError("bad_request", error.message);
        }
        throw error;
      }
    },

    chunkSearch: async (body: ChunkSearchBody) => {
      if (queryRuntime?.chunkSearch === undefined) {
        return serviceError(
          "unavailable",
          "Document chunk search is unavailable: docs.documents and docs.document_elements must exist in the warehouse (run docs_refresh).",
        );
      }
      const started = Date.now();
      try {
        const rows = await queryRuntime.chunkSearch(body);
        auditOperation(options, {
          operation: "chunkSearch",
          rowCount: rows.length,
          durationMs: Date.now() - started,
        });
        return {
          rows,
          provenance: buildChunkSearchProvenance(rows),
        };
      } catch (error) {
        return serviceError(
          "bad_request",
          error instanceof Error ? error.message : "Chunk search failed.",
        );
      }
    },

    entityProfile: async (body: EntityProfileBody) => {
      if (queryRuntime?.entityProfile === undefined) {
        return serviceError(
          "unavailable",
          "Entity profiles are unavailable: docs tables missing or warehouse not configured (BACKED_DATABRICKS_CATALOG, BACKED_DOCUMENTS_SCHEMA).",
        );
      }
      const started = Date.now();
      try {
        const profile = await queryRuntime.entityProfile(body);
        auditOperation(options, {
          operation: "entityProfile",
          rowCount: profile.matches.length,
          durationMs: Date.now() - started,
        });
        return {
          profile,
          provenance:
            ontology !== undefined
              ? buildEntityProfileProvenance(profile, ontology)
              : emptyProvenanceWhenNoOntology(),
        };
      } catch (error) {
        return serviceError(
          "bad_request",
          error instanceof Error ? error.message : "Entity profile lookup failed.",
        );
      }
    },

    getDocument: async (documentId: string): Promise<GetDocumentResponse | ServiceErrorResult> => {
      if (queryRuntime?.documentAccess === undefined) {
        return serviceError(
          "unavailable",
          "Document metadata is unavailable: docs.documents must exist in the warehouse (run docs_refresh).",
        );
      }
      const metadata = await queryRuntime.documentAccess.getMetadata(documentId);
      if (metadata === null) {
        return serviceError("not_found", `Document "${documentId}" not found.`);
      }
      return metadata;
    },

    describeDocumentPreview: async (
      documentId: string,
      page: number,
    ): Promise<DocumentPreviewResponse | ServiceErrorResult> => {
      if (queryRuntime?.documentAccess === undefined) {
        return serviceError(
          "unavailable",
          "Document preview is unavailable: docs.documents must exist in the warehouse (run docs_refresh).",
        );
      }
      const metadata = await queryRuntime.documentAccess.getMetadata(documentId);
      if (metadata === null) {
        return serviceError("not_found", `Document "${documentId}" not found.`);
      }
      if (page < 1) {
        return serviceError("bad_request", "Query parameter page must be >= 1.");
      }
      if (metadata.pageCount > 0 && page > metadata.pageCount) {
        return serviceError(
          "bad_request",
          `Page ${String(page)} is out of range (document has ${String(metadata.pageCount)} pages).`,
        );
      }
      if (!hasDocumentPreview) {
        return serviceError(
          "unavailable",
          "Document file preview is unavailable: configure Databricks volume file access (BACKED_DATABRICKS_*).",
        );
      }
      const descriptor = await queryRuntime.documentAccess.describePreview(documentId, page);
      if (descriptor === null) {
        return serviceError("not_found", `Document "${documentId}" not found.`);
      }
      return descriptor;
    },

    readDocumentPreview: async (
      documentId: string,
      options: { page: number; range?: string | undefined },
    ): Promise<ServiceErrorResult | { page: number; file: DocumentPreviewFile }> => {
      const described = await (async () => {
        if (queryRuntime?.documentAccess === undefined) {
          return serviceError(
            "unavailable",
            "Document preview is unavailable: docs.documents must exist in the warehouse (run docs_refresh).",
          );
        }
        const metadata = await queryRuntime.documentAccess.getMetadata(documentId);
        if (metadata === null) {
          return serviceError("not_found", `Document "${documentId}" not found.`);
        }
        if (options.page < 1) {
          return serviceError("bad_request", "Query parameter page must be >= 1.");
        }
        if (metadata.pageCount > 0 && options.page > metadata.pageCount) {
          return serviceError(
            "bad_request",
            `Page ${String(options.page)} is out of range (document has ${String(metadata.pageCount)} pages).`,
          );
        }
        if (!hasDocumentPreview) {
          return serviceError(
            "unavailable",
            "Document file preview is unavailable: configure Databricks volume file access (BACKED_DATABRICKS_*).",
          );
        }
        return null;
      })();
      if (described !== null) {
        return described;
      }
      const access = queryRuntime?.documentAccess;
      if (access === undefined) {
        return serviceError("unavailable", "Document preview is unavailable.");
      }
      try {
        const file = await access.readOriginalFile(documentId, {
          range: options.range,
        });
        const previewFile: DocumentPreviewFile = {
          status: file.status,
          data: file.data,
          contentType: file.contentType,
          filename: file.filename,
          ...(file.contentLength !== undefined ? { contentLength: file.contentLength } : {}),
          ...(file.contentRange !== undefined ? { contentRange: file.contentRange } : {}),
          ...(file.acceptRanges !== undefined ? { acceptRanges: file.acceptRanges } : {}),
        };
        return { file: previewFile, page: options.page };
      } catch (error) {
        return serviceError(
          "bad_request",
          error instanceof Error ? error.message : "Document preview failed.",
        );
      }
    },

    graphTraverse: async (body: GraphTraverseBody) => {
      if (queryRuntime?.graphTraverse === undefined) {
        return serviceError(
          "unavailable",
          "Graph traverse is unavailable: configure warehouse catalog and published ontology mappings.",
        );
      }
      const started = Date.now();
      try {
        const rows = await queryRuntime.graphTraverse(body);
        auditOperation(options, {
          operation: "graphTraverse",
          rowCount: rows.length,
          durationMs: Date.now() - started,
        });
        return {
          rows,
          provenance: buildGraphTraverseProvenance(rows),
        };
      } catch (error) {
        return serviceError(
          "bad_request",
          error instanceof Error ? error.message : "Graph traverse failed.",
        );
      }
    },

    capabilities: () => ({
      model: true,
      objectQuery: queryRuntime !== undefined,
      entitySearch: true,
      chunkSearch: hasChunkSearch,
      entityProfile: hasEntityProfile,
      graphTraverse: hasGraphTraverse,
      documentMetadata: hasDocumentAccess,
      documentPreview: hasDocumentPreview,
      provenance: ontology !== undefined,
    }),
  };
}

export type AnchorService = ReturnType<typeof createAnchorService>;
