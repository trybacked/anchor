import type { OntologyObject } from "@trybacked/core";
import { ObjectQueryCompileError } from "./errors.js";
import type { ObjectQueryFilter, ObjectQueryFilterOp, SqlParameter } from "./query.js";
const COMPARISON_OPS = ["eq", "neq", "gt", "gte", "lt", "lte"] as const;
type ComparisonOp = (typeof COMPARISON_OPS)[number];
const FILTER_OP_SQL: Record<ComparisonOp, string> = {
  eq: "=",
  neq: "<>",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
};
function isComparisonOp(op: ObjectQueryFilterOp): op is ComparisonOp {
  return (COMPARISON_OPS as readonly string[]).includes(op);
}
export function escapeLikePattern(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}
function quoteIdentifier(identifier: string): string {
  return `\`${identifier.replaceAll("`", "``")}\``;
}
function assertKnownProperty(object: OntologyObject, propertyId: string): void {
  if (!object.properties.some((property) => property.id === propertyId)) {
    throw new ObjectQueryCompileError(
      "unknown_property",
      `Property "${propertyId}" is not part of object "${object.id}".`,
    );
  }
}
export function compileObjectFilter(
  object: OntologyObject,
  tableAlias: string,
  filter: ObjectQueryFilter,
  parameters: SqlParameter[],
): string {
  assertKnownProperty(object, filter.propertyId);
  const column = `${quoteIdentifier(tableAlias)}.${quoteIdentifier(filter.propertyId)}`;
  if (filter.op === "is_null") {
    return `${column} IS NULL`;
  }
  if (filter.op === "is_not_null") {
    return `${column} IS NOT NULL`;
  }
  if (filter.op === "contains" || filter.op === "not_contains" || filter.op === "starts_with") {
    if (typeof filter.value !== "string") {
      throw new ObjectQueryCompileError(
        "invalid_filter",
        `Operator "${filter.op}" requires a string value (property "${filter.propertyId}").`,
      );
    }
    const name = `p${String(parameters.length)}`;
    const pattern =
      filter.op === "starts_with"
        ? `${escapeLikePattern(filter.value)}%`
        : `%${escapeLikePattern(filter.value)}%`;
    parameters.push({ name, value: pattern });
    const predicate = `LOWER(${column}) LIKE LOWER(:${name})`;
    return filter.op === "not_contains" ? `NOT (${predicate})` : predicate;
  }
  if (filter.op === "in" || filter.op === "not_in") {
    if (!Array.isArray(filter.value)) {
      throw new ObjectQueryCompileError(
        "invalid_filter",
        `Operator "${filter.op}" requires an array value (property "${filter.propertyId}").`,
      );
    }
    if (filter.value.length === 0) {
      return filter.op === "in" ? "1 = 0" : "1 = 1";
    }
    const placeholders = filter.value.map((entry, index) => {
      const name = `p${String(parameters.length)}_${String(index)}`;
      if (typeof entry !== "string" && typeof entry !== "number" && typeof entry !== "boolean") {
        throw new ObjectQueryCompileError(
          "invalid_filter",
          `Invalid value in "${filter.op}" list.`,
        );
      }
      parameters.push({ name, value: entry });
      return `:${name}`;
    });
    const predicate = `${column} ${filter.op === "in" ? "IN" : "NOT IN"} (${placeholders.join(", ")})`;
    return predicate;
  }
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
  if (!isComparisonOp(filter.op)) {
    throw new ObjectQueryCompileError("invalid_filter", "Unsupported filter operator.");
  }
  const name = `p${String(parameters.length)}`;
  if (
    typeof filter.value !== "string" &&
    typeof filter.value !== "number" &&
    typeof filter.value !== "boolean"
  ) {
    throw new ObjectQueryCompileError(
      "invalid_filter",
      `Invalid value for operator "${filter.op}".`,
    );
  }
  parameters.push({ name, value: filter.value });
  return `${column} ${FILTER_OP_SQL[filter.op]} :${name}`;
}
export function compileTextSearch(
  object: OntologyObject,
  tableAlias: string,
  query: string,
  propertyIds: string[] | undefined,
  parameters: SqlParameter[],
): string {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    throw new ObjectQueryCompileError("invalid_filter", "textSearch.query must not be empty.");
  }
  const targets =
    propertyIds !== undefined && propertyIds.length > 0
      ? propertyIds
      : object.properties
          .filter((property) => property.type === "string")
          .map((property) => property.id);
  if (targets.length === 0) {
    throw new ObjectQueryCompileError(
      "invalid_filter",
      `textSearch on object "${object.id}" has no string columns to search.`,
    );
  }
  const name = `p${String(parameters.length)}`;
  parameters.push({ name, value: `%${escapeLikePattern(trimmed)}%` });
  const parts = targets.map((propertyId) => {
    assertKnownProperty(object, propertyId);
    const column = `${quoteIdentifier(tableAlias)}.${quoteIdentifier(propertyId)}`;
    return `LOWER(${column}) LIKE LOWER(:${name})`;
  });
  return `(${parts.join(" OR ")})`;
}
