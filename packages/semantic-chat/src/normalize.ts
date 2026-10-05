import type { ObjectQuery } from "@trybacked/compiler";
import type {
  ObjectQueryRequest,
  ObjectSetDefinition,
  RowFilter,
  SemanticQueryPlan,
} from "./plan-types.js";
const LEGACY_OP_TO_COMPILER: Record<string, string> = {
  "=": "eq",
  "!=": "neq",
  ">": "gt",
  ">=": "gte",
  "<": "lt",
  "<=": "lte",
  contains: "contains",
  not_contains: "not_contains",
  eq: "eq",
  neq: "neq",
  gt: "gt",
  gte: "gte",
  lt: "lt",
  lte: "lte",
  in: "in",
  not_in: "not_in",
  is_null: "is_null",
  is_not_null: "is_not_null",
  starts_with: "starts_with",
};
function normalizeFilterOp(op: RowFilter["op"]): NonNullable<ObjectQuery["filters"]>[number]["op"] {
  const mapped = LEGACY_OP_TO_COMPILER[op];
  if (mapped === undefined) {
    throw new Error(`Unsupported filter operator "${op}".`);
  }
  return mapped as NonNullable<ObjectQuery["filters"]>[number]["op"];
}
function normalizeRootPropertyId(propertyId: string, rootObjectId: string): string {
  const prefix = `${rootObjectId}.`;
  if (propertyId.startsWith(prefix)) {
    return propertyId.slice(prefix.length);
  }
  return propertyId;
}
function normalizeFilter(
  filter: RowFilter,
  defaultEntityId: string,
): NonNullable<ObjectQuery["filters"]>[number] {
  const rawPropertyId = filter.propertyId ?? filter.column;
  if (rawPropertyId === undefined) {
    throw new Error("Filter is missing propertyId/column.");
  }
  const objectId = filter.entityId ?? defaultEntityId;
  const propertyId = normalizeRootPropertyId(rawPropertyId, defaultEntityId);
  return {
    ...(objectId !== defaultEntityId ? { objectId } : {}),
    propertyId,
    op: normalizeFilterOp(filter.op),
    value: filter.value,
  };
}
function mergeObjectSet(
  query: ObjectQueryRequest,
  objectSet: ObjectSetDefinition | undefined,
): ObjectQueryRequest {
  if (objectSet === undefined) {
    return query;
  }
  const scopedFilters = objectSet.filters.map((filter) => ({
    ...filter,
    entityId: filter.entityId ?? objectSet.entityId,
  }));
  const documentIds = [...(query.documentIds ?? []), ...(objectSet.documentIds ?? [])];
  return {
    ...query,
    filters: [...scopedFilters, ...query.filters],
    ...(documentIds.length > 0 ? { documentIds: [...new Set(documentIds)] } : {}),
    limit: query.limit ?? objectSet.limit,
  };
}
function applyDocumentIdFilters(
  query: ObjectQueryRequest,
  objectId: string,
): NonNullable<ObjectQuery["filters"]> {
  if (query.documentIds === undefined || query.documentIds.length === 0) {
    return [];
  }
  if (query.documentIds.length === 1) {
    return [
      {
        objectId,
        propertyId: "document_id",
        op: "eq",
        value: query.documentIds[0] ?? "",
      },
    ];
  }
  return [
    {
      objectId,
      propertyId: "document_id",
      op: "in",
      value: [...query.documentIds],
    },
  ];
}
function applyTimeRange(
  objectSet: ObjectSetDefinition | undefined,
  objectId: string,
): NonNullable<ObjectQuery["filters"]> {
  const range = objectSet?.timeRange;
  if (range === undefined) {
    return [];
  }
  const column = range.column;
  const filters: NonNullable<ObjectQuery["filters"]> = [];
  if (range.from !== undefined) {
    filters.push({ objectId, propertyId: column, op: "gte", value: range.from });
  }
  if (range.to !== undefined) {
    filters.push({ objectId, propertyId: column, op: "lte", value: range.to });
  }
  return filters;
}
export type NormalizedSemanticQueryPlan = {
  reasoning?: string | undefined;
  objectQuery: ObjectQuery;
  attempts?: number | undefined;
};
export function normalizeSemanticQueryPlan(plan: SemanticQueryPlan): NormalizedSemanticQueryPlan {
  const merged = mergeObjectSet(plan.objectQuery, plan.objectSet);
  const objectId = merged.entityId;
  const baseFilters = merged.filters.map((filter) => normalizeFilter(filter, objectId));
  const documentFilters = applyDocumentIdFilters(merged, objectId);
  const timeFilters = applyTimeRange(plan.objectSet, plan.objectSet?.entityId ?? objectId);
  const objectQuery: ObjectQuery = {
    objectId,
    filters: [...baseFilters, ...documentFilters, ...timeFilters],
    ...(merged.mode !== undefined ? { mode: merged.mode } : {}),
    ...(merged.limit !== undefined ? { limit: merged.limit } : {}),
    ...(merged.joins !== undefined ? { joins: merged.joins } : {}),
    ...(merged.select !== undefined ? { select: merged.select } : {}),
    ...(merged.groupBy !== undefined
      ? {
          groupBy: merged.groupBy.map((propertyId) =>
            normalizeRootPropertyId(propertyId, objectId),
          ),
        }
      : {}),
    ...(merged.orderBy !== undefined
      ? { orderBy: normalizeRootPropertyId(merged.orderBy, objectId) }
      : {}),
    ...(merged.orderDirection !== undefined ? { orderDirection: merged.orderDirection } : {}),
    ...(merged.textSearch !== undefined
      ? {
          textSearch: {
            query: merged.textSearch.query,
            ...(merged.textSearch.entityId !== undefined
              ? { objectId: merged.textSearch.entityId }
              : {}),
            ...(merged.textSearch.columns !== undefined
              ? { propertyIds: merged.textSearch.columns }
              : {}),
          },
        }
      : {}),
    ...(merged.aggregations !== undefined
      ? {
          aggregations: merged.aggregations.map((aggregation) => {
            const rawPropertyId = aggregation.propertyId ?? aggregation.column;
            return {
              op: aggregation.op,
              ...(rawPropertyId !== undefined
                ? { propertyId: normalizeRootPropertyId(rawPropertyId, objectId) }
                : {}),
              ...(aggregation.alias !== undefined ? { alias: aggregation.alias } : {}),
            };
          }),
        }
      : {}),
  };
  return {
    ...(plan.reasoning !== undefined ? { reasoning: plan.reasoning } : {}),
    objectQuery,
  };
}
