import type { Entity, Proposal, Relation, Rule, SemanticModel } from "@backed/core";
import { ProposalSchema } from "@backed/core";
import { resolveReviewConfidenceThreshold } from "./env.js";
import { selectReviewQuestions } from "./questions.js";
import { compressProfile } from "./compress.js";
import type { ProfileReport } from "@backed/core";

function isCarriedForward(entity: Entity, affectedTables: Set<string>): boolean {
  return !affectedTables.has(entity.sourceTable);
}

function mergeEntities(
  existing: SemanticModel,
  fresh: Proposal,
  affectedTables: Set<string>,
): Entity[] {
  const carried = existing.entities.filter((entity) => isCarriedForward(entity, affectedTables));
  const carriedIds = new Set(carried.map((entity) => entity.id));
  const freshEntities = fresh.entities.filter(
    (entity) => affectedTables.has(entity.sourceTable) || !carriedIds.has(entity.id),
  );
  return [...carried, ...freshEntities];
}

function entityById(entities: Entity[]): Map<string, Entity> {
  return new Map(entities.map((entity) => [entity.id, entity]));
}

function mergeRelations(
  existing: SemanticModel,
  fresh: Proposal,
  entities: Entity[],
  affectedTables: Set<string>,
): Relation[] {
  const ids = entityById(entities);
  const carried = existing.relations.filter((relation) => {
    const from = ids.get(relation.fromEntity);
    const to = ids.get(relation.toEntity);
    if (!from || !to) {
      return false;
    }
    return isCarriedForward(from, affectedTables) && isCarriedForward(to, affectedTables);
  });
  const carriedIds = new Set(carried.map((relation) => relation.id));
  const freshRelations = fresh.relations.filter((relation) => !carriedIds.has(relation.id));
  return [...carried, ...freshRelations];
}

function mergeRules(
  existing: SemanticModel,
  fresh: Proposal,
  entities: Entity[],
  affectedTables: Set<string>,
): Rule[] {
  const ids = entityById(entities);
  const carried = existing.rules.filter((rule) => {
    const entity = ids.get(rule.appliesTo);
    return entity !== undefined && isCarriedForward(entity, affectedTables);
  });
  const carriedIds = new Set(carried.map((rule) => rule.id));
  const freshRules = fresh.rules.filter((rule) => !carriedIds.has(rule.id));
  return [...carried, ...freshRules];
}

/** Carry confirmed model elements forward; replace only tables touched by the profile diff. */
export function mergeIncrementalProposal(
  fresh: Proposal,
  existing: SemanticModel,
  affectedTables: Set<string>,
  profile: ProfileReport,
): Proposal {
  const entities = mergeEntities(existing, fresh, affectedTables);
  const relations = mergeRelations(existing, fresh, entities, affectedTables);
  const rules = mergeRules(existing, fresh, entities, affectedTables);
  const tables = compressProfile(profile);
  const reviewConfidenceThreshold = resolveReviewConfidenceThreshold();
  const questions = selectReviewQuestions(
    entities,
    relations,
    rules,
    tables,
    reviewConfidenceThreshold,
  );

  return ProposalSchema.parse({
    runId: fresh.runId,
    generatedAt: fresh.generatedAt,
    entities,
    relations,
    rules,
    doubts: fresh.doubts,
    questions,
    usage: fresh.usage,
  });
}
