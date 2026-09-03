/**
 * Deterministic comparison between two runs — no LLM. Structural changes on
 * profiles (tables, columns, types) and on the semantic model (entities,
 * relations, rules). Output validated against ModelDiffSchema.
 */

import { ModelDiffSchema } from "@backed/core";
import type {
  DiffChange,
  Entity,
  ModelDiff,
  ProfileReport,
  Relation,
  Rule,
  TableProfile,
} from "@backed/core";

/** Subset shared by SemanticModel and Proposal — both are diffable. */
export interface ModelElements {
  entities: Entity[];
  relations: Relation[];
  rules: Rule[];
}

export interface RunSnapshot {
  runId: string;
  profile: ProfileReport;
  model?: ModelElements;
}

function byName<T>(items: T[], key: (item: T) => string): Map<string, T> {
  return new Map(items.map((item) => [key(item), item]));
}

function diffTables(previous: ProfileReport, next: ProfileReport): DiffChange[] {
  const changes: DiffChange[] = [];
  const previousTables = byName(previous, (table) => table.table);
  const nextTables = byName(next, (table) => table.table);

  for (const [name] of nextTables) {
    if (!previousTables.has(name)) {
      changes.push({ kind: "table_added", subject: name, detail: `New table "${name}"` });
    }
  }
  for (const [name] of previousTables) {
    if (!nextTables.has(name)) {
      changes.push({ kind: "table_removed", subject: name, detail: `Table "${name}" removed` });
    }
  }
  for (const [name, nextTable] of nextTables) {
    const previousTable = previousTables.get(name);
    if (previousTable) {
      changes.push(...diffColumns(previousTable, nextTable));
    }
  }
  return changes;
}

function diffColumns(previous: TableProfile, next: TableProfile): DiffChange[] {
  const changes: DiffChange[] = [];
  const previousColumns = byName(previous.columns, (column) => column.name);
  const nextColumns = byName(next.columns, (column) => column.name);
  const table = next.table;

  for (const [name] of nextColumns) {
    if (!previousColumns.has(name)) {
      changes.push({
        kind: "column_added",
        subject: `${table}.${name}`,
        detail: `New column "${name}" in table "${table}"`,
      });
    }
  }
  for (const [name] of previousColumns) {
    if (!nextColumns.has(name)) {
      changes.push({
        kind: "column_removed",
        subject: `${table}.${name}`,
        detail: `Column "${name}" removed from table "${table}"`,
      });
    }
  }
  for (const [name, nextColumn] of nextColumns) {
    const previousColumn = previousColumns.get(name);
    if (previousColumn && previousColumn.sqlType !== nextColumn.sqlType) {
      changes.push({
        kind: "column_type_changed",
        subject: `${table}.${name}`,
        detail: `Type of "${table}.${name}" changed from ${previousColumn.sqlType} to ${nextColumn.sqlType}`,
        before: previousColumn.sqlType,
        after: nextColumn.sqlType,
      });
    }
  }
  return changes;
}

function columnExists(profile: ProfileReport, tableName: string, columnName: string): boolean {
  const table = profile.find((candidate) => candidate.table === tableName);
  return table !== undefined && table.columns.some((column) => column.name === columnName);
}

/** A relation is broken when the anchoring columns disappeared from the new profile. */
function isRelationBroken(
  relation: Relation,
  entities: Map<string, Entity>,
  nextProfile: ProfileReport,
): boolean {
  const fromTable = entities.get(relation.fromEntity)?.sourceTable;
  const toTable = entities.get(relation.toEntity)?.sourceTable;
  if (!fromTable || !toTable) {
    return true;
  }
  return (
    !columnExists(nextProfile, fromTable, relation.fromColumn) ||
    !columnExists(nextProfile, toTable, relation.toColumn)
  );
}

function diffModelElements(
  previous: ModelElements,
  next: ModelElements | undefined,
  nextProfile: ProfileReport,
): DiffChange[] {
  const changes: DiffChange[] = [];
  const previousEntities = byName(previous.entities, (entity) => entity.id);
  const nextEntities = byName(next?.entities ?? [], (entity) => entity.id);
  const previousRelations = byName(previous.relations, (relation) => relation.id);
  const nextRelations = byName(next?.relations ?? [], (relation) => relation.id);
  const previousRules = byName(previous.rules, (rule) => rule.id);
  const nextRules = byName(next?.rules ?? [], (rule) => rule.id);

  for (const [id, entity] of nextEntities) {
    if (!previousEntities.has(id)) {
      changes.push({
        kind: "entity_added",
        subject: id,
        detail: `New entity "${entity.name}"`,
      });
    }
  }
  for (const [id, entity] of previousEntities) {
    if (!nextEntities.has(id)) {
      changes.push({
        kind: "entity_removed",
        subject: id,
        detail: `Entity "${entity.name}" removed`,
      });
    }
  }

  for (const [id, relation] of nextRelations) {
    if (!previousRelations.has(id)) {
      changes.push({
        kind: "relation_added",
        subject: id,
        detail: `New relation "${relation.name}"`,
      });
    }
  }
  for (const [id, relation] of previousRelations) {
    if (nextRelations.has(id)) {
      continue;
    }
    if (isRelationBroken(relation, previousEntities, nextProfile)) {
      changes.push({
        kind: "relation_broken",
        subject: id,
        detail: `Relation "${relation.name}" broken: anchor columns (${relation.fromColumn} → ${relation.toColumn}) no longer exist`,
      });
    } else {
      changes.push({
        kind: "relation_removed",
        subject: id,
        detail: `Relation "${relation.name}" removed`,
      });
    }
  }

  for (const [id, rule] of nextRules) {
    if (!previousRules.has(id)) {
      changes.push({ kind: "rule_added", subject: id, detail: `New rule "${rule.name}"` });
    }
  }
  for (const [id, rule] of previousRules) {
    if (!nextRules.has(id)) {
      changes.push({ kind: "rule_removed", subject: id, detail: `Rule "${rule.name}" removed` });
    }
  }

  return changes;
}

export function diffRuns(
  previous: RunSnapshot,
  next: RunSnapshot,
  now: Date = new Date(),
): ModelDiff {
  const emptyElements: ModelElements = { entities: [], relations: [], rules: [] };
  const hasModel = previous.model !== undefined || next.model !== undefined;
  const changes = [
    ...diffTables(previous.profile, next.profile),
    ...(hasModel
      ? diffModelElements(previous.model ?? emptyElements, next.model, next.profile)
      : []),
  ];

  return ModelDiffSchema.parse({
    fromRunId: previous.runId,
    toRunId: next.runId,
    generatedAt: now.toISOString(),
    changes,
  });
}
