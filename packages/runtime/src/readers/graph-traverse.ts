import { compileObjectFilter } from "@trybacked/compiler";
import type { ObjectQueryFilter, SqlParameter } from "@trybacked/compiler";
import type { Ontology, SemanticModel } from "@trybacked/core";
import {
  buildRelationPath,
  clampTraverseDepth,
  resolveRelationPath,
  type RelationPathSegment,
  type TraverseDirection,
} from "@trybacked/core/graph-traverse";
import type { SqlStatementExecutor } from "../execute.js";
import { MAX_TRAVERSE_ROW_LIMIT } from "./constants.js";
import type { DocumentsDatasetResolver } from "./dataset.js";
import { resolveEntityTable } from "./dataset.js";
import { toSqlLimitLiteral } from "./sql-limit-literal.js";
export type GraphTraverseInput = {
  relationId: string;
  value: string | number;
  direction?: TraverseDirection | undefined;
  depth?: number | undefined;
  limit: number;
  mode?: "rows" | "count" | undefined;
  filters?: ObjectQueryFilter[] | undefined;
};
function quoteIdentifier(identifier: string): string {
  return `\`${identifier.replaceAll("`", "``")}\``;
}
function aliasFor(entityId: string): string {
  return `t_${entityId.replaceAll("-", "_")}`;
}
function resolveOntologyObject(ontology: Ontology, entityId: string) {
  const object = ontology.objects.find((candidate) => candidate.id === entityId);
  if (object === undefined) {
    return null;
  }
  return object;
}
function appendJoins(
  segments: RelationPathSegment[],
  model: SemanticModel,
  ontology: Ontology,
  documents: DocumentsDatasetResolver | undefined,
  joined: Set<string>,
): {
  fromClause: string;
  joins: string[];
  terminalEntityId: string;
} | null {
  const firstSegment = segments[0];
  if (firstSegment === undefined) {
    return null;
  }
  const startEntityId = firstSegment.fromEntity;
  const startTable = resolveEntityTable(model, ontology, startEntityId, documents);
  if (startTable === null) {
    return null;
  }
  joined.add(startEntityId);
  const joins: string[] = [];
  const fromClause = `${startTable} AS ${quoteIdentifier(aliasFor(startEntityId))}`;
  for (const segment of segments) {
    const { fromEntity, toEntity, fromColumn, toColumn } = segment;
    if (joined.has(fromEntity) && !joined.has(toEntity)) {
      const toTable = resolveEntityTable(model, ontology, toEntity, documents);
      if (toTable === null) {
        return null;
      }
      joins.push(
        `JOIN ${toTable} AS ${quoteIdentifier(aliasFor(toEntity))} ON ${quoteIdentifier(aliasFor(fromEntity))}.${quoteIdentifier(fromColumn)} = ${quoteIdentifier(aliasFor(toEntity))}.${quoteIdentifier(toColumn)}`,
      );
      joined.add(toEntity);
      continue;
    }
    if (joined.has(toEntity) && !joined.has(fromEntity)) {
      const fromTable = resolveEntityTable(model, ontology, fromEntity, documents);
      if (fromTable === null) {
        return null;
      }
      joins.push(
        `JOIN ${fromTable} AS ${quoteIdentifier(aliasFor(fromEntity))} ON ${quoteIdentifier(aliasFor(toEntity))}.${quoteIdentifier(toColumn)} = ${quoteIdentifier(aliasFor(fromEntity))}.${quoteIdentifier(fromColumn)}`,
      );
      joined.add(fromEntity);
    }
  }
  const lastSegment = segments[segments.length - 1];
  const terminalEntityId = lastSegment?.toEntity ?? startEntityId;
  return { fromClause, joins, terminalEntityId };
}
export function createGraphTraverseReader(options: {
  model: SemanticModel;
  ontology: Ontology;
  executor: SqlStatementExecutor;
  documents: DocumentsDatasetResolver | undefined;
}): (input: GraphTraverseInput) => Promise<Record<string, unknown>[]> {
  const { model, ontology, executor, documents } = options;
  return async (input) => {
    const direction: TraverseDirection = input.direction ?? "forward";
    const depth = clampTraverseDepth(input.depth);
    const mode = input.mode ?? "rows";
    const hops = buildRelationPath(model, input.relationId, direction, depth);
    if (hops === null) {
      return [];
    }
    const segments = resolveRelationPath(model, hops);
    if (segments === null || segments.length === 0) {
      return [];
    }
    const orientedSegments =
      direction === "forward"
        ? segments
        : segments.map((segment) => ({
            ...segment,
            fromEntity: segment.toEntity,
            toEntity: segment.fromEntity,
            fromColumn: segment.toColumn,
            toColumn: segment.fromColumn,
          }));
    const joined = new Set<string>();
    const clause = appendJoins(orientedSegments, model, ontology, documents, joined);
    if (clause === null) {
      return [];
    }
    const firstHop = orientedSegments[0];
    if (firstHop === undefined) {
      return [];
    }
    const startEntityId = firstHop.fromEntity;
    const startColumn = firstHop.fromColumn;
    const parameters: SqlParameter[] = [];
    const filterConditions: string[] = [];
    for (const filter of input.filters ?? []) {
      const targetObjectId = filter.objectId ?? clause.terminalEntityId;
      const object = resolveOntologyObject(ontology, targetObjectId);
      if (object === null) {
        continue;
      }
      filterConditions.push(
        compileObjectFilter(object, aliasFor(targetObjectId), filter, parameters),
      );
    }
    const extraWhere = filterConditions.length > 0 ? ` AND ${filterConditions.join(" AND ")}` : "";
    if (mode === "count") {
      const sql = `SELECT COUNT(*) AS ${quoteIdentifier("count")}
FROM ${clause.fromClause}
${clause.joins.join("\n")}
WHERE ${quoteIdentifier(aliasFor(startEntityId))}.${quoteIdentifier(startColumn)} = :startValue${extraWhere}`;
      return executor(sql, [{ name: "startValue", value: input.value }, ...parameters]);
    }
    const selectList = [...joined]
      .flatMap((entityId) => {
        const entity = model.entities.find((candidate) => candidate.id === entityId);
        if (entity === undefined) {
          return [`${quoteIdentifier(aliasFor(entityId))}.*`];
        }
        return entity.properties.map(
          (property) =>
            `${quoteIdentifier(aliasFor(entityId))}.${quoteIdentifier(property.columnName)} AS ${quoteIdentifier(`${entityId}.${property.columnName}`)}`,
        );
      })
      .join(", ");
    const sql = `SELECT ${selectList}
FROM ${clause.fromClause}
${clause.joins.join("\n")}
WHERE ${quoteIdentifier(aliasFor(startEntityId))}.${quoteIdentifier(startColumn)} = :startValue${extraWhere}
LIMIT ${toSqlLimitLiteral(input.limit, MAX_TRAVERSE_ROW_LIMIT)}`;
    return executor(sql, [{ name: "startValue", value: input.value }, ...parameters]);
  };
}
