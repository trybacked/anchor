export const PACKAGE_NAME = "@backed/diff" as const;
export { diffRuns } from "./diff-runs.js";
export type { ModelElements, RunSnapshot } from "./diff-runs.js";
export { affectedTablesFromProfileDiff, filterProfileToTables, PIPELINE_INFRA_TABLES, } from "./affected-tables.js";
export { formatDiff } from "./format.js";
