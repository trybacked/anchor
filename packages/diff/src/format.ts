/** Human-readable English rendering of diff.json for the CLI. */

import type { DiffChange, DiffChangeKind, ModelDiff } from "@backed/core";

function changeMarker(kind: DiffChangeKind): string {
  switch (kind) {
    case "table_added":
    case "column_added":
    case "entity_added":
    case "relation_added":
    case "rule_added": {
      return "+";
    }
    case "table_removed":
    case "column_removed":
    case "entity_removed":
    case "relation_removed":
    case "rule_removed": {
      return "-";
    }
    case "column_type_changed": {
      return "~";
    }
    case "relation_broken": {
      return "!";
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
  const summary =
    breaking > 0
      ? `${String(diff.changes.length)} changes, including ${String(breaking)} broken relation(s) (!)`
      : `${String(diff.changes.length)} changes`;

  return [header, summary, ...diff.changes.map(formatChange)].join("\n");
}
