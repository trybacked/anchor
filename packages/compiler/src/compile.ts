import type { Ontology, OntologyObject } from "@trybacked/core";
import { ObjectQueryCompileError } from "./errors.js";
import { compileObjectFilter, compileTextSearch } from "./filters.js";
import {
  compileJoinOnClause,
  planObjectQueryJoins,
  resolveObjectInPlan,
  type JoinPlan,
} from "./join-plan.js";
import { DEFAULT_OBJECT_QUERY_LIMIT, ObjectQuerySchema } from "./query.js";
import type {
  CompiledObjectQuery,
  ObjectQuery,
  ObjectQueryAggregation,
  SqlParameter,
} from "./query.js";
import { compileExistsSemiJoin, queryUsesPhysicalJoins } from "./semi-join.js";
function quoteIdentifier(identifier: string): string {
  return `\`${identifier.replaceAll("`", "``")}\``;
}
function quoteDatasetId(datasetId: string): string {
  return datasetId.split(".").map(quoteIdentifier).join(".");
}
function resolveObject(ontology: Ontology, objectId: string): OntologyObject {
  const object = ontology.objects.find((candidate) => candidate.id === objectId);
  if (object === undefined) {
    throw new ObjectQueryCompileError(
      "unknown_object",
      `Object "${objectId}" is not part of the ontology.`,
    );
  }
  return object;
}
function resolveDatasetId(object: OntologyObject): string {
  if (object.sourceDatasetId === undefined) {
    throw new ObjectQueryCompileError(
      "missing_dataset_mapping",
      `Object "${object.id}" has no backing dataset mapping (sourceDatasetId).`,
    );
  }
  return object.sourceDatasetId;
}
function assertKnownProperty(object: OntologyObject, propertyId: string): void {
  if (!object.properties.some((property) => property.id === propertyId)) {
    throw new ObjectQueryCompileError(
      "unknown_property",
      `Property "${propertyId}" is not part of object "${object.id}".`,
    );
  }
}
function resolveAggregationAlias(aggregation: ObjectQueryAggregation, index: number): string {
  if (aggregation.alias !== undefined && aggregation.alias.length > 0) {
    return aggregation.alias;
  }
  if (aggregation.propertyId !== undefined && aggregation.propertyId.length > 0) {
    return `${aggregation.propertyId}_${aggregation.op}`;
  }
  return index === 0 ? "count" : `count_${String(index)}`;
}
type FromClause = {
  fromSql: string;
  rootAlias: string;
  joinedObjectIds: string[];
  joinPlan: JoinPlan | null;
  usePhysicalJoins: boolean;
};
function buildFromClause(
  ontology: Ontology,
  query: ReturnType<typeof ObjectQuerySchema.parse>,
  usePhysicalJoins: boolean,
): FromClause {
  const rootObject = resolveObject(ontology, query.objectId);
  const rootDataset = quoteDatasetId(resolveDatasetId(rootObject));
  const relationshipIds = (query.joins ?? []).map((join) => join.relationshipId);
  if (relationshipIds.length === 0) {
    const rootAlias = "o0";
    return {
      fromSql: `${rootDataset} AS ${quoteIdentifier(rootAlias)}`,
      rootAlias,
      joinedObjectIds: [query.objectId],
      joinPlan: null,
      usePhysicalJoins: false,
    };
  }
  const plan = planObjectQueryJoins(ontology, query.objectId, relationshipIds);
  if (!usePhysicalJoins) {
    const rootAlias = "o0";
    return {
      fromSql: `${rootDataset} AS ${quoteIdentifier(rootAlias)}`,
      rootAlias,
      joinedObjectIds: [...plan.objectAliases.keys()],
      joinPlan: plan,
      usePhysicalJoins: false,
    };
  }
  const quoteColumn = (objectId: string, propertyId: string): string => {
    const alias = plan.objectAliases.get(objectId);
    if (alias === undefined) {
      throw new ObjectQueryCompileError(
        "unknown_join_object",
        `Missing alias for object "${objectId}".`,
      );
    }
    return `${quoteIdentifier(alias)}.${quoteIdentifier(propertyId)}`;
  };
  const joinClauses = plan.steps.map((step) => {
    const toObject = resolveObject(ontology, step.toObjectId);
    const toDataset = quoteDatasetId(resolveDatasetId(toObject));
    const toAlias = plan.objectAliases.get(step.toObjectId);
    if (toAlias === undefined) {
      throw new ObjectQueryCompileError("invalid_join", "Join target alias missing.");
    }
    const on = compileJoinOnClause(step, quoteColumn);
    return `INNER JOIN ${toDataset} AS ${quoteIdentifier(toAlias)} ON ${on}`;
  });
  const rootAlias = plan.objectAliases.get(query.objectId) ?? "o0";
  const fromSql = `${rootDataset} AS ${quoteIdentifier(rootAlias)}\n${joinClauses.join("\n")}`;
  return {
    fromSql,
    rootAlias,
    joinedObjectIds: [...plan.objectAliases.keys()],
    joinPlan: plan,
    usePhysicalJoins: true,
  };
}
function resolveFilterTarget(
  ontology: Ontology,
  query: ReturnType<typeof ObjectQuerySchema.parse>,
  from: FromClause,
  targetObjectId: string,
): {
  object: OntologyObject;
  alias: string;
} {
  if (from.joinPlan === null) {
    if (targetObjectId !== query.objectId) {
      throw new ObjectQueryCompileError(
        "unknown_join_object",
        `Filter object "${targetObjectId}" requires a "joins" chain from "${query.objectId}".`,
      );
    }
    return { object: resolveObject(ontology, targetObjectId), alias: from.rootAlias };
  }
  return resolveObjectInPlan(ontology, from.joinPlan, targetObjectId);
}
function compileWhereClause(
  ontology: Ontology,
  query: ReturnType<typeof ObjectQuerySchema.parse>,
  from: FromClause,
  parameters: SqlParameter[],
): string {
  const conditions: string[] = [];
  for (const filter of query.filters) {
    const targetObjectId = filter.objectId ?? query.objectId;
    if (!from.usePhysicalJoins && from.joinPlan !== null && targetObjectId !== query.objectId) {
      continue;
    }
    const { object, alias } = resolveFilterTarget(ontology, query, from, targetObjectId);
    conditions.push(compileObjectFilter(object, alias, filter, parameters));
  }
  if (query.textSearch !== undefined) {
    const searchObjectId = query.textSearch.objectId ?? query.objectId;
    if (from.usePhysicalJoins || from.joinPlan === null || searchObjectId === query.objectId) {
      const { object, alias } = resolveFilterTarget(ontology, query, from, searchObjectId);
      conditions.push(
        compileTextSearch(
          object,
          alias,
          query.textSearch.query,
          query.textSearch.propertyIds,
          parameters,
        ),
      );
    }
  }
  if (!from.usePhysicalJoins && from.joinPlan !== null) {
    conditions.push(
      compileExistsSemiJoin(ontology, from.joinPlan, from.rootAlias, query, parameters),
    );
  }
  return conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
}
function compileOrderClause(
  ontology: Ontology,
  query: ReturnType<typeof ObjectQuerySchema.parse>,
  from: FromClause,
  projectedColumns?: readonly string[],
): string {
  const { orderBy } = query;
  if (orderBy === undefined) {
    return "";
  }
  const direction = query.orderDirection ?? "asc";
  if (projectedColumns !== undefined) {
    if (!projectedColumns.includes(orderBy)) {
      throw new ObjectQueryCompileError(
        "invalid_order_by",
        `orderBy "${orderBy}" must be one of the projected columns ${JSON.stringify(projectedColumns)} when using groupBy/aggregations; set an aggregation alias to order by an aggregate.`,
      );
    }
    return ` ORDER BY ${quoteIdentifier(orderBy)} ${direction}`;
  }
  const dot = orderBy.indexOf(".");
  if (dot > 0) {
    const objectId = orderBy.slice(0, dot);
    const propertyId = orderBy.slice(dot + 1);
    const { object, alias } = resolveFilterTarget(ontology, query, from, objectId);
    assertKnownProperty(object, propertyId);
    return ` ORDER BY ${quoteIdentifier(alias)}.${quoteIdentifier(propertyId)} ${direction}`;
  }
  const rootObject = resolveObject(ontology, query.objectId);
  if (!rootObject.properties.some((property) => property.id === orderBy)) {
    throw new ObjectQueryCompileError(
      "invalid_order_by",
      `orderBy "${orderBy}" is not a property of object "${query.objectId}"; use a property id of that object or "objectId.propertyId" for a joined column.`,
    );
  }
  return ` ORDER BY ${quoteIdentifier(from.rootAlias)}.${quoteIdentifier(orderBy)} ${direction}`;
}
function resolveSelectColumns(
  ontology: Ontology,
  query: ReturnType<typeof ObjectQuerySchema.parse>,
  from: FromClause,
): {
  selectList: string;
  columns: string[];
} {
  const rootObject = resolveObject(ontology, query.objectId);
  const items = query.select ?? rootObject.properties.map((property) => property.id);
  const selectParts: string[] = [];
  const columns: string[] = [];
  for (const item of items) {
    const dot = item.indexOf(".");
    if (dot > 0) {
      const objectId = item.slice(0, dot);
      const propertyId = item.slice(dot + 1);
      const { object, alias } = resolveFilterTarget(ontology, query, from, objectId);
      assertKnownProperty(object, propertyId);
      const outputName = `${objectId}.${propertyId}`;
      selectParts.push(
        `${quoteIdentifier(alias)}.${quoteIdentifier(propertyId)} AS ${quoteIdentifier(outputName)}`,
      );
      columns.push(outputName);
      continue;
    }
    assertKnownProperty(rootObject, item);
    selectParts.push(`${quoteIdentifier(from.rootAlias)}.${quoteIdentifier(item)}`);
    columns.push(item);
  }
  return { selectList: selectParts.join(", "), columns };
}
export function compileObjectQuery(ontology: Ontology, input: ObjectQuery): CompiledObjectQuery {
  const query = ObjectQuerySchema.parse(input);
  const rootObject = resolveObject(ontology, query.objectId);
  const parameters: SqlParameter[] = [];
  const hasJoins = (query.joins ?? []).length > 0;
  const usePhysicalJoins = hasJoins && queryUsesPhysicalJoins(query.objectId, query.select);
  if (hasJoins && query.mode === "count" && usePhysicalJoins) {
    throw new ObjectQueryCompileError(
      "invalid_join",
      "mode count with joined projection (select objectId.property) is not supported — omit select or use semi-join filters only.",
    );
  }
  const from = buildFromClause(ontology, query, usePhysicalJoins);
  const whereClause = compileWhereClause(ontology, query, from, parameters);
  const aggregations = query.aggregations ?? [];
  if (aggregations.length === 0 && (query.groupBy ?? []).length > 0) {
    throw new ObjectQueryCompileError(
      "invalid_aggregation",
      `groupBy ${JSON.stringify(query.groupBy)} needs at least one aggregation (e.g. {"op":"count","alias":"count"}); without one the breakdown would silently return plain rows.`,
    );
  }
  if (aggregations.length > 0) {
    for (const propertyId of query.groupBy ?? []) {
      assertKnownProperty(rootObject, propertyId);
    }
    const groupColumns = (query.groupBy ?? []).map(
      (propertyId) => `${quoteIdentifier(from.rootAlias)}.${quoteIdentifier(propertyId)}`,
    );
    const aggExpressions = aggregations.map((aggregation, index) => {
      if (aggregation.op === "count" && aggregation.propertyId === undefined) {
        return `COUNT(*) AS ${quoteIdentifier(resolveAggregationAlias(aggregation, index))}`;
      }
      assertKnownProperty(rootObject, aggregation.propertyId ?? "");
      const column = `${quoteIdentifier(from.rootAlias)}.${quoteIdentifier(aggregation.propertyId ?? "")}`;
      return `${aggregation.op.toUpperCase()}(${column}) AS ${quoteIdentifier(resolveAggregationAlias(aggregation, index))}`;
    });
    const selectList = [...groupColumns, ...aggExpressions].join(", ");
    const groupClause = groupColumns.length > 0 ? ` GROUP BY ${groupColumns.join(", ")}` : "";
    const resultColumns = [
      ...(query.groupBy ?? []),
      ...aggregations.map((aggregation, index) => resolveAggregationAlias(aggregation, index)),
    ];
    const orderClause = compileOrderClause(ontology, query, from, resultColumns);
    const limit = query.limit ?? DEFAULT_OBJECT_QUERY_LIMIT;
    const sql = `SELECT ${selectList} FROM ${from.fromSql}${whereClause}${groupClause}${orderClause} LIMIT ${String(limit)}`;
    return {
      objectId: rootObject.id,
      sql,
      parameters,
      columns: resultColumns,
      joinedObjectIds: from.joinedObjectIds,
    };
  }
  if (query.mode === "count") {
    const sql = `SELECT COUNT(*) AS ${quoteIdentifier("count")} FROM ${from.fromSql}${whereClause}`;
    return {
      objectId: rootObject.id,
      sql,
      parameters,
      columns: ["count"],
      joinedObjectIds: from.joinedObjectIds,
    };
  }
  const limit = query.limit ?? DEFAULT_OBJECT_QUERY_LIMIT;
  const { selectList, columns } = resolveSelectColumns(ontology, query, from);
  const orderClause = compileOrderClause(ontology, query, from);
  const sql = `SELECT ${selectList} FROM ${from.fromSql}${whereClause}${orderClause} LIMIT ${String(limit)}`;
  return {
    objectId: rootObject.id,
    sql,
    parameters,
    columns,
    joinedObjectIds: from.joinedObjectIds,
  };
}
