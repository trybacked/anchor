/** Diff semantico tra run: colonna nuova, tipo cambiato, relazione rotta */

export const PACKAGE_NAME = "@backed/diff" as const;

export { diffRuns } from "./diff-runs.js";
export type { ModelElements, RunSnapshot } from "./diff-runs.js";
export { formatDiff } from "./format.js";
