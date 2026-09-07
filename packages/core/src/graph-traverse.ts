import type { Relation, SemanticModel } from "./model.js";
export const MIN_TRAVERSE_DEPTH = 1;
export const MAX_TRAVERSE_DEPTH = 3;
export type TraverseDirection = "forward" | "reverse";
export interface GraphTraverseRequest {
    relationId: string;
    value: string | number;
    direction?: TraverseDirection | undefined;
    depth?: number | undefined;
    limit: number;
}
export type GraphTraverser = (request: GraphTraverseRequest) => Promise<Record<string, unknown>[]>;
export interface RelationHop {
    relationId: string;
    direction: TraverseDirection;
}
export function clampTraverseDepth(depth: number | undefined): number {
    const requested = depth ?? MIN_TRAVERSE_DEPTH;
    return Math.min(Math.max(MIN_TRAVERSE_DEPTH, requested), MAX_TRAVERSE_DEPTH);
}
function hopEndEntity(relation: Relation, direction: TraverseDirection): string {
    return direction === "forward" ? relation.toEntity : relation.fromEntity;
}
function findNextRelation(model: SemanticModel, currentEntityId: string, direction: TraverseDirection, usedRelationIds: ReadonlySet<string>): Relation | null {
    for (const candidate of model.relations) {
        if (usedRelationIds.has(candidate.id)) {
            continue;
        }
        if (direction === "forward" && candidate.fromEntity === currentEntityId) {
            return candidate;
        }
        if (direction === "reverse" && candidate.toEntity === currentEntityId) {
            return candidate;
        }
    }
    return null;
}
export function buildRelationPath(model: SemanticModel, startRelationId: string, direction: TraverseDirection, depth: number): RelationHop[] | null {
    const startRelation = model.relations.find((candidate) => candidate.id === startRelationId);
    if (startRelation === undefined) {
        return null;
    }
    const hops: RelationHop[] = [{ relationId: startRelation.id, direction }];
    const usedRelationIds = new Set<string>([startRelation.id]);
    let currentEntityId = hopEndEntity(startRelation, direction);
    while (hops.length < depth) {
        const nextRelation = findNextRelation(model, currentEntityId, direction, usedRelationIds);
        if (nextRelation === null) {
            break;
        }
        hops.push({ relationId: nextRelation.id, direction });
        usedRelationIds.add(nextRelation.id);
        currentEntityId = hopEndEntity(nextRelation, direction);
    }
    return hops;
}
export interface RelationPathSegment {
    relationId: string;
    direction: TraverseDirection;
    fromEntity: string;
    toEntity: string;
    fromColumn: string;
    toColumn: string;
}
export function resolveRelationPath(model: SemanticModel, hops: RelationHop[]): RelationPathSegment[] | null {
    const segments: RelationPathSegment[] = [];
    for (const hop of hops) {
        const relation = model.relations.find((candidate) => candidate.id === hop.relationId);
        if (relation === undefined) {
            return null;
        }
        segments.push({
            relationId: relation.id,
            direction: hop.direction,
            fromEntity: relation.fromEntity,
            toEntity: relation.toEntity,
            fromColumn: relation.fromColumn,
            toColumn: relation.toColumn,
        });
    }
    return segments;
}
