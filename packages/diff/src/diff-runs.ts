import { ModelDiffSchema } from "@backed/core";
import type { DiffChange, Entity, ModelDiff, ProfileReport, Relation, Rule } from "@backed/core";
import { columnExists, diffProfile } from "./profile-diff.js";
import { collectAdded, collectAddedRemoved, indexByKey } from "./utils.js";

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

const EMPTY_MODEL_ELEMENTS: ModelElements = { entities: [], relations: [], rules: [] };

function isRelationBroken(relation: Relation, entities: Map<string, Entity>, nextProfile: ProfileReport): boolean {
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
    const previousEntities = indexByKey(previous.entities, (entity) => entity.id);
    const nextEntities = indexByKey(next?.entities ?? [], (entity) => entity.id);
    const previousRelations = indexByKey(previous.relations, (relation) => relation.id);
    const nextRelations = indexByKey(next?.relations ?? [], (relation) => relation.id);
    const previousRules = indexByKey(previous.rules, (rule) => rule.id);
    const nextRules = indexByKey(next?.rules ?? [], (rule) => rule.id);

    const changes = [
        ...collectAddedRemoved(
            previousEntities,
            nextEntities,
            (id, entity) => ({ kind: "entity_added", subject: id, detail: `New entity "${entity.name}"` }),
            (id, entity) => ({ kind: "entity_removed", subject: id, detail: `Entity "${entity.name}" removed` }),
        ),
        ...collectAdded(
            previousRelations,
            nextRelations,
            (id, relation) => ({ kind: "relation_added", subject: id, detail: `New relation "${relation.name}"` }),
        ),
        ...collectAddedRemoved(
            previousRules,
            nextRules,
            (id, rule) => ({ kind: "rule_added", subject: id, detail: `New rule "${rule.name}"` }),
            (id, rule) => ({ kind: "rule_removed", subject: id, detail: `Rule "${rule.name}" removed` }),
        ),
    ];

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
        }
        else {
            changes.push({
                kind: "relation_removed",
                subject: id,
                detail: `Relation "${relation.name}" removed`,
            });
        }
    }

    return changes;
}

export function diffRuns(previous: RunSnapshot, next: RunSnapshot, now: Date = new Date()): ModelDiff {
    const hasModel = previous.model !== undefined || next.model !== undefined;
    const changes = [
        ...diffProfile(previous.profile, next.profile),
        ...(hasModel
            ? diffModelElements(previous.model ?? EMPTY_MODEL_ELEMENTS, next.model, next.profile)
            : []),
    ];
    return ModelDiffSchema.parse({
        fromRunId: previous.runId,
        toRunId: next.runId,
        generatedAt: now.toISOString(),
        changes,
    });
}
