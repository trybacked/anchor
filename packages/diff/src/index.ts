/** Semantic diff between runs: new column, changed type, broken relation */

export const PACKAGE_NAME = "@backed/diff" as const;

export { diffRuns } from "./diff-runs.js";
export type { ModelElements, RunSnapshot } from "./diff-runs.js";
export {
  affectedTablesFromProfileDiff,
  filterProfileToTables,
} from "./affected-tables.js";
export { formatDiff } from "./format.js";
