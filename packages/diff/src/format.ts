import type { DiffChange, DiffChangeKind, ModelDiff } from "@backed/core";
const CHANGE_MARKER_ADDED = "+";
const CHANGE_MARKER_REMOVED = "-";
const CHANGE_MARKER_CHANGED = "~";
const CHANGE_MARKER_BROKEN = "!";
function changeMarker(kind: DiffChangeKind): string {
    switch (kind) {
        case "table_added":
        case "column_added":
        case "entity_added":
        case "relation_added":
        case "rule_added": {
            return CHANGE_MARKER_ADDED;
        }
        case "table_removed":
        case "column_removed":
        case "entity_removed":
        case "relation_removed":
        case "rule_removed": {
            return CHANGE_MARKER_REMOVED;
        }
        case "column_type_changed": {
            return CHANGE_MARKER_CHANGED;
        }
        case "relation_broken": {
            return CHANGE_MARKER_BROKEN;
        }
        default: {
            const _exhaustive: never = kind;
            throw new Error(`Unhandled change kind: ${String(_exhaustive)}`);
        }
    }
}
function formatChange(change: DiffChange): string {
    return `  ${changeMarker(change.kind)} ${change.detail}`;
}
export function formatDiff(diff: ModelDiff): string {
    const header = `Diff between run ${diff.fromRunId} → ${diff.toRunId}`;
    if (diff.changes.length === 0) {
        return `${header}\nNo changes detected.`;
    }
    const breaking = diff.changes.filter((change) => change.kind === "relation_broken").length;
    const summary = breaking > 0
        ? `${String(diff.changes.length)} changes, including ${String(breaking)} broken relation(s) (${CHANGE_MARKER_BROKEN})`
        : `${String(diff.changes.length)} changes`;
    return [header, summary, ...diff.changes.map(formatChange)].join("\n");
}
