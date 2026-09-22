import type { Ontology, OntologyObject } from "@trybacked/core";
import { ObjectQueryCompileError } from "./errors.js";
import { DEFAULT_OBJECT_QUERY_LIMIT, ObjectQuerySchema } from "./query.js";
import type {
  CompiledObjectQuery,
  ObjectQuery,
  ObjectQueryFilter,
  ObjectQueryFilterOp,
  SqlParameter,
} from "./query.js";

const FILTER_OP_SQL: Record<ObjectQueryFilterOp, string> = {
  eq: "=",
  neq: "<>",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
};

/** Quotes one identifier segment with backticks (Databricks / Spark SQL). */
function quoteIdentifier(identifier: string): string {
  return `\`${identifier.replaceAll("`", "``")}\``;
}

/** Quotes a dataset id, treating dots as catalog/schema/table separators. */
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

function compileFilter(
  object: OntologyObject,
  filter: ObjectQueryFilter,
  parameters: SqlParameter[],
): string {
  assertKnownProperty(object, filter.propertyId);
  const column = quoteIdentifier(filter.propertyId);
  if (filter.value === null) {
    if (filter.op === "eq") {
      return `${column} IS NULL`;
    }
    if (filter.op === "neq") {
      return `${column} IS NOT NULL`;
    }
    throw new ObjectQueryCompileError(
      "invalid_filter",
      `Operator "${filter.op}" does not accept null (property "${filter.propertyId}").`,
    );
  }
  const name = `p${String(parameters.length)}`;
  parameters.push({ name, value: filter.value });
  return `${column} ${FILTER_OP_SQL[filter.op]} :${name}`;
}

/**
 * Compiles an ontology object query into one parameterized SELECT.
 * Columns and the backing table come from the published mappings;
 * filter values are bound as named parameters, never inlined.
 */
export function compileObjectQuery(ontology: Ontology, input: ObjectQuery): CompiledObjectQuery {
  const query = ObjectQuerySchema.parse(input);
  const object = resolveObject(ontology, query.objectId);
  const datasetId = resolveDatasetId(object);
  const columns = object.properties.map((property) => property.id);
  const parameters: SqlParameter[] = [];
  const conditions = query.filters.map((filter) => compileFilter(object, filter, parameters));
  const limit = query.limit ?? DEFAULT_OBJECT_QUERY_LIMIT;

  const selectList = columns.map(quoteIdentifier).join(", ");
  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT ${selectList} FROM ${quoteDatasetId(datasetId)}${whereClause} LIMIT ${String(limit)}`;

  return { objectId: object.id, sql, parameters, columns };
}
