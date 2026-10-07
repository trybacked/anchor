import type { Entity, Property, Proposal, Relation } from "@trybacked/core";
import { buildReviewQuestions } from "@trybacked/discovery";
import type { OntologyExtractOutput } from "./extract-output.js";

const LLM_EVIDENCE = "llm_file_extraction";

function mergeProperty(
  base: Property,
  patch: NonNullable<OntologyExtractOutput["entities"][number]["properties"]>[number],
): Property {
  return {
    ...base,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.semanticType !== undefined ? { semanticType: patch.semanticType } : {}),
    ...(patch.role !== undefined ? { role: patch.role } : {}),
    ...(patch.confidence !== undefined ? { confidence: patch.confidence } : {}),
    ...(patch.semantics !== undefined ? { semantics: patch.semantics } : {}),
    provenance: {
      ...base.provenance,
      evidence: `${base.provenance.evidence}; ${LLM_EVIDENCE}`,
    },
  };
}

function mergeEntity(base: Entity, patch: OntologyExtractOutput["entities"][number]): Entity {
  let properties = base.properties;
  if (patch.properties !== undefined && patch.properties.length > 0) {
    properties = base.properties.map((property) => {
      const columnPatch = patch.properties?.find(
        (entry) => entry.columnName === property.columnName,
      );
      if (columnPatch === undefined) {
        return property;
      }
      return mergeProperty(property, columnPatch);
    });
  }
  return {
    ...base,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.confidence !== undefined ? { confidence: patch.confidence } : {}),
    ...(patch.semantics !== undefined ? { semantics: patch.semantics } : {}),
    properties,
    provenance: {
      ...base.provenance,
      evidence: `${base.provenance.evidence}; ${LLM_EVIDENCE}`,
    },
  };
}

function relationFromExtract(
  relation: NonNullable<OntologyExtractOutput["relations"]>[number],
  entityIds: Set<string>,
  sourceTableByEntity: Map<string, string>,
): Relation | null {
  if (!entityIds.has(relation.fromEntity) || !entityIds.has(relation.toEntity)) {
    return null;
  }
  const fromTable = sourceTableByEntity.get(relation.fromEntity) ?? relation.fromEntity;
  return {
    id: relation.id,
    name: relation.name,
    fromEntity: relation.fromEntity,
    toEntity: relation.toEntity,
    fromColumn: relation.fromColumn,
    toColumn: relation.toColumn,
    cardinality: relation.cardinality,
    status: "proposed",
    confidence: relation.confidence ?? 0.7,
    provenance: {
      table: fromTable,
      column: relation.fromColumn,
      evidence: relation.rationale ?? LLM_EVIDENCE,
    },
  };
}

export function mergeOntologyExtractIntoProposal(
  baseline: Proposal,
  extract: OntologyExtractOutput,
  options: { reviewConfidenceThreshold: number },
): Proposal {
  const patchById = new Map(extract.entities.map((entity) => [entity.id, entity]));
  const entities = baseline.entities.map((entity) => {
    const patch = patchById.get(entity.id);
    if (patch === undefined) {
      return entity;
    }
    return mergeEntity(entity, patch);
  });
  const entityIds = new Set(entities.map((entity) => entity.id));
  const sourceTableByEntity = new Map(entities.map((entity) => [entity.id, entity.sourceTable]));
  const existingRelationKeys = new Set(
    baseline.relations.map(
      (relation) =>
        `${relation.fromEntity}:${relation.fromColumn}->${relation.toEntity}:${relation.toColumn}`,
    ),
  );
  const addedRelations: Relation[] = [];
  for (const relation of extract.relations ?? []) {
    const mapped = relationFromExtract(relation, entityIds, sourceTableByEntity);
    if (mapped === null) {
      continue;
    }
    const key = `${mapped.fromEntity}:${mapped.fromColumn}->${mapped.toEntity}:${mapped.toColumn}`;
    if (
      existingRelationKeys.has(key) ||
      baseline.relations.some((existing) => existing.id === mapped.id)
    ) {
      continue;
    }
    existingRelationKeys.add(key);
    addedRelations.push(mapped);
  }
  const relations = [...baseline.relations, ...addedRelations];
  const doubts = [...baseline.doubts, ...(extract.doubts ?? [])];
  const questions = buildReviewQuestions(entities, relations, options.reviewConfidenceThreshold);
  return {
    ...baseline,
    entities,
    relations,
    doubts,
    questions,
  };
}
