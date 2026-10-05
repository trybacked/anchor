import {
  DEFAULT_WAREHOUSE_ROW_LIMIT,
  SEMANTIC_CHAT_MAX_ROW_LIMIT,
  type Ontology,
} from "@trybacked/core";
import type { AnchorService } from "../anchor-service.js";
import { isServiceErrorResult } from "../service-error.js";
const COUNT_ALIAS = "value_count";
export type PropertyValueHit = {
  value: string;
  count: number;
};
export type GetPropertyValuesInput = {
  objectId: string;
  propertyId: string;
  prefix?: string | undefined;
  limit?: number | undefined;
};
export type GetPropertyValuesResult = {
  objectId: string;
  propertyId: string;
  values: PropertyValueHit[];
  sql?: string | undefined;
};
function formatValue(raw: unknown): string {
  switch (typeof raw) {
    case "string":
      return raw;
    case "number":
    case "boolean":
    case "bigint":
      return String(raw);
    case "object":
      return JSON.stringify(raw);
    case "undefined":
    case "symbol":
    case "function":
      return "";
  }
}
export async function getPropertyValues(
  service: AnchorService,
  ontology: Ontology,
  input: GetPropertyValuesInput,
): Promise<GetPropertyValuesResult> {
  const object = ontology.objects.find((candidate) => candidate.id === input.objectId);
  if (object === undefined) {
    throw new Error(`Unknown object "${input.objectId}".`);
  }
  if (!object.properties.some((property) => property.id === input.propertyId)) {
    throw new Error(`Unknown property "${input.propertyId}" on "${input.objectId}".`);
  }
  const limit = Math.min(
    Math.max(input.limit ?? DEFAULT_WAREHOUSE_ROW_LIMIT, 1),
    SEMANTIC_CHAT_MAX_ROW_LIMIT,
  );
  const filters =
    input.prefix !== undefined && input.prefix.length > 0
      ? [
          {
            propertyId: input.propertyId,
            op: "starts_with" as const,
            value: input.prefix,
          },
        ]
      : [];
  const queryResult = await service.objectQuery({
    objectId: input.objectId,
    mode: "rows",
    groupBy: [input.propertyId],
    aggregations: [{ op: "count", alias: COUNT_ALIAS }],
    filters,
    orderBy: COUNT_ALIAS,
    orderDirection: "desc",
    limit: limit + 1,
  });
  if (isServiceErrorResult(queryResult)) {
    throw new Error(queryResult.error.message);
  }
  const values: PropertyValueHit[] = [];
  for (const row of queryResult.rows) {
    const raw = row[input.propertyId];
    const countRaw = row[COUNT_ALIAS];
    if (raw === null || raw === undefined) {
      continue;
    }
    const value = formatValue(raw);
    const count =
      typeof countRaw === "number"
        ? countRaw
        : typeof countRaw === "string"
          ? Number.parseInt(countRaw, 10)
          : 0;
    values.push({ value, count: Number.isFinite(count) ? count : 0 });
  }
  const topValues = values.slice(0, limit);
  return {
    objectId: input.objectId,
    propertyId: input.propertyId,
    values: topValues,
    ...(queryResult.sql !== undefined ? { sql: queryResult.sql } : {}),
  };
}
