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
import {
  capQueryObjectsPayload,
} from "./response-cap.js";

export type AnchorServiceOptions = {
  model: SemanticModel;
  ontology?: Ontology | undefined;
  queryRuntime?: OntologyQueryRuntime | undefined;
  searchModelOptions?: SearchModelOptions | undefined;
  onOperation?: AnchorOperationAuditHook | undefined;
  auditPrincipal?: string | undefined;
  executionProfile?: ExecutionBudgetProfile | undefined;
};

export type ServiceErrorResult = { error: string };

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
  const {
    model,
    ontology,
    queryRuntime,
    searchModelOptions,
    executionProfile = "api",
  } = options;

  const hasChunkSearch = queryRuntime?.chunkSearch !== undefined;
  const hasEntityProfile = queryRuntime?.entityProfile !== undefined;
  const hasGraphTraverse = queryRuntime?.graphTraverse !== undefined;

  return {
    listEntities: () => listEntities(model),

    getEntity: (id: string) => {
      const detail = getEntity(model, id);
      if (detail === null) {
        return { error: `Entity "${id}" not found.` } satisfies ServiceErrorResult;
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
        return {
          error: "Object queries are unavailable: no published ontology or warehouse.",
        } satisfies ServiceErrorResult;
      }
      const parsed = ObjectQuerySchema.safeParse(input);
      if (!parsed.success) {
        return {
          error: `Invalid query: ${parsed.error.issues[0]?.message ?? "bad input"}`,
        } satisfies ServiceErrorResult;
      }
      const started = Date.now();
      try {
        const mode = parsed.data.mode;
        let query = applyQueryExecutionBudget(parsed.data, executionProfile);
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
        if (error instanceof ObjectQueryCompileError || error instanceof QueryExecutionBudgetError) {
          return { error: error.message } satisfies ServiceErrorResult;
        }
        throw error;
      }
    },

    chunkSearch: async (body: ChunkSearchBody) => {
      if (queryRuntime?.chunkSearch === undefined) {
        return {
          error:
            "Document chunk search is unavailable: docs.documents and docs.document_elements must exist in the warehouse (run docs_refresh).",
        } satisfies ServiceErrorResult;
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
        return {
          error: error instanceof Error ? error.message : "Chunk search failed.",
        } satisfies ServiceErrorResult;
      }
    },

    entityProfile: async (body: EntityProfileBody) => {
      if (queryRuntime?.entityProfile === undefined) {
        return {
          error:
            "Entity profiles are unavailable: docs tables missing or warehouse not configured (BACKED_DATABRICKS_CATALOG, BACKED_DOCUMENTS_SCHEMA).",
        } satisfies ServiceErrorResult;
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
        return {
          error: error instanceof Error ? error.message : "Entity profile lookup failed.",
        } satisfies ServiceErrorResult;
      }
    },

    graphTraverse: async (body: GraphTraverseBody) => {
      if (queryRuntime?.graphTraverse === undefined) {
        return {
          error:
            "Graph traverse is unavailable: configure warehouse catalog and published ontology mappings.",
        } satisfies ServiceErrorResult;
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
        return {
          error: error instanceof Error ? error.message : "Graph traverse failed.",
        } satisfies ServiceErrorResult;
      }
    },

    capabilities: () => ({
      model: true,
      objectQuery: queryRuntime !== undefined,
      entitySearch: true,
      chunkSearch: hasChunkSearch,
      entityProfile: hasEntityProfile,
      graphTraverse: hasGraphTraverse,
      provenance: ontology !== undefined,
    }),
  };
}

export type AnchorService = ReturnType<typeof createAnchorService>;
