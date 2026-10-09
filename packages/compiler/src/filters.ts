import type { OntologyObject } from "@trybacked/core";
import type { SqlDialect } from "@trybacked/ports";
import { sparkDialect } from "./dialects.js";
import { ObjectQueryCompileError } from "./errors.js";
import type { ObjectQueryFilter, ObjectQueryFilterOp, SqlParameter } from "./query.js";
import { assertKnownProperty } from "./validation.js";

const defaultDialect: SqlDialect = sparkDialect;
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

export const WHOLE_WORD_MAX_TERM_LENGTH = 3;
function wholeWordRegex(term: string): string {
  const quoted = `\\Q${term.replaceAll("\\E", "\\E\\\\E\\Q")}\\E`;
  return `(?i)(?<![\\p{L}\\p{N}])${quoted}(?![\\p{L}\\p{N}])`;
}

function textMatchPredicate(
  dialect: SqlDialect,
  term: string,
  parameters: SqlParameter[],
): (column: string) => string {
  const name = `p${String(parameters.length)}`;
  if (term.length <= WHOLE_WORD_MAX_TERM_LENGTH) {
    parameters.push({ name, value: wholeWordRegex(term) });
    return (column) => dialect.regexMatch(column, name) ?? dialect.ciContains(column, name);
  }
  parameters.push({ name, value: `%${escapeLikePattern(term)}%` });
  return (column) => dialect.ciContains(column, name);
}
function quoteIdentifier(identifier: string): string {
  return `\`${identifier.replaceAll("`", "``")}\``;
}
export function compileObjectFilter(
  object: OntologyObject,
  tableAlias: string,
  filter: ObjectQueryFilter,
  parameters: SqlParameter[],
  dialect: SqlDialect = defaultDialect,
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
        { path: "filters.propertyId" },
      );
    }
    if (filter.op === "starts_with") {
      const name = `p${String(parameters.length)}`;
      parameters.push({ name, value: `${escapeLikePattern(filter.value)}%` });
      return dialect.ciContains(column, name);
    }
    const predicate = textMatchPredicate(dialect, filter.value, parameters)(column);
    return filter.op === "not_contains" ? `NOT (${predicate})` : predicate;
  }
  if (filter.op === "in" || filter.op === "not_in") {
    if (!Array.isArray(filter.value)) {
      throw new ObjectQueryCompileError(
        "invalid_filter",
        `Operator "${filter.op}" requires an array value (property "${filter.propertyId}").`,
        { path: "filters.propertyId" },
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
          { path: "filters.propertyId" },
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
      { path: "filters.propertyId" },
    );
  }
  if (!isComparisonOp(filter.op)) {
    throw new ObjectQueryCompileError("invalid_filter", "Unsupported filter operator.", {
      path: "filters.propertyId",
    });
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
      { path: "filters.propertyId" },
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
  dialect: SqlDialect = defaultDialect,
): string {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    throw new ObjectQueryCompileError("invalid_filter", "textSearch.query must not be empty.", {
      path: "textSearch.query",
    });
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
      { path: "textSearch.propertyIds", invalidValue: object.id },
    );
  }
  const match = textMatchPredicate(dialect, trimmed, parameters);
  const parts = targets.map((propertyId) => {
    assertKnownProperty(object, propertyId);
    return match(`${quoteIdentifier(tableAlias)}.${quoteIdentifier(propertyId)}`);
  });
  return `(${parts.join(" OR ")})`;
}
