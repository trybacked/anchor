import type { DetectedPattern, OntologyPropertyType } from "@trybacked/core";

export function inferPropertyType(sqlType: string, patterns: DetectedPattern[]): OntologyPropertyType {
  const upper = sqlType.toUpperCase();
  if (upper.startsWith("BOOLEAN")) {
    return "boolean";
  }
  if (upper.startsWith("INTEGER") || upper.startsWith("BIGINT") || upper.startsWith("HUGEINT")) {
    return "integer";
  }
  if (upper.startsWith("DOUBLE") || upper.startsWith("FLOAT")) {
    return "float";
  }
  if (upper.startsWith("DECIMAL")) {
    return "decimal";
  }
  if (upper.startsWith("DATE") && !upper.startsWith("TIMESTAMP")) {
    return "date";
  }
  if (upper.startsWith("TIMESTAMP")) {
    return "datetime";
  }
  if (upper.startsWith("JSON") || upper.startsWith("STRUCT")) {
    return "json";
  }

  const dominantPattern = patterns.find((pattern) => pattern.matchRatio >= 0.8);
  if (dominantPattern?.kind === "date") {
    return "date";
  }
  if (dominantPattern?.kind === "amount") {
    return "decimal";
  }

  return "string";
}
