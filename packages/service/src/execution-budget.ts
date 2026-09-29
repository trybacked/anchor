import { MAX_OBJECT_QUERY_JOINS, type ObjectQuery } from "@trybacked/compiler";
import {
  DEFAULT_WAREHOUSE_ROW_LIMIT,
  MAX_WAREHOUSE_ROW_LIMIT,
  SEMANTIC_CHAT_MAX_ROW_LIMIT,
} from "@trybacked/core";

export type ExecutionBudgetProfile = "api" | "mcp" | "semantic_chat";

export class QueryExecutionBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryExecutionBudgetError";
  }
}

function defaultRowLimit(profile: ExecutionBudgetProfile): number {
  switch (profile) {
    case "semantic_chat":
      return Math.min(DEFAULT_WAREHOUSE_ROW_LIMIT, SEMANTIC_CHAT_MAX_ROW_LIMIT);
    case "api":
    case "mcp":
      return DEFAULT_WAREHOUSE_ROW_LIMIT;
  }
}

function maxRowLimit(profile: ExecutionBudgetProfile): number {
  switch (profile) {
    case "semantic_chat":
      return SEMANTIC_CHAT_MAX_ROW_LIMIT;
    case "api":
    case "mcp":
      return MAX_WAREHOUSE_ROW_LIMIT;
  }
}

/**
 * Clamps and validates an object query before warehouse execution.
 * Count mode skips row limits; rows mode always gets an explicit capped LIMIT.
 */
export function applyQueryExecutionBudget(
  query: ObjectQuery,
  profile: ExecutionBudgetProfile,
): ObjectQuery {
  const joins = query.joins ?? [];
  if (joins.length > MAX_OBJECT_QUERY_JOINS) {
    throw new QueryExecutionBudgetError(
      `At most ${String(MAX_OBJECT_QUERY_JOINS)} joins are allowed per query.`,
    );
  }

  const mode = query.mode ?? "rows";
  if (mode === "count") {
    return query;
  }

  const requested = query.limit ?? defaultRowLimit(profile);
  const cap = maxRowLimit(profile);
  if (requested > cap) {
    throw new QueryExecutionBudgetError(
      `Row limit ${String(requested)} exceeds maximum ${String(cap)} for ${profile}.`,
    );
  }

  if (requested <= 0) {
    throw new QueryExecutionBudgetError("Row limit must be positive.");
  }

  return {
    ...query,
    mode,
    limit: requested,
  };
}
