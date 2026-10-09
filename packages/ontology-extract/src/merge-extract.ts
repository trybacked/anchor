import {
  PROFILE_FK_OVERLAP_THRESHOLD,
  type Doubt,
  type Entity,
  type GlossaryTerm,
  type Property,
  type Proposal,
  type Relation,
} from "@trybacked/core";
import { buildReviewQuestions } from "@trybacked/discovery";
import type { OntologyExtractOutput } from "./extract-output.js";

const LLM_EVIDENCE = "llm_file_extraction";
const DEFAULT_LLM_RELATION_CONFIDENCE = 0.7;

type ExtractEntityPatch = NonNullable<OntologyExtractOutput["entities"][number]>;
type ExtractPropertyPatch = NonNullable<ExtractEntityPatch["properties"]>[number];
type ExtractRelation = NonNullable<OntologyExtractOutput["relations"]>[number];

function profileForeignKeyEvidence(entity: Entity, columnName: string): Property | undefined {
  const property = entity.properties.find((candidate) => candidate.columnName === columnName);
  if (property?.role !== "foreign_key" || property.provenance.method !== "profile") {
    return undefined;
  }
  return property;
}

function mergeProperty(base: Property, patch: ExtractPropertyPatch): Property {
  return {
    ...base,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.semanticType !== undefined ? { semanticType: patch.semanticType } : {}),
    ...(patch.role !== undefined ? { role: patch.role } : {}),
    ...(patch.confidence !== undefined ? { confidence: patch.confidence } : {}),
    ...(patch.semantics !== undefined ? { semantics: patch.semantics } : {}),
    provenance: {
      ...base.provenance,
      method: "llm",
    },
  };
}

function mergeEntity(base: Entity, patch: ExtractEntityPatch): Entity {
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
      method: "llm",
    },
  };
}

function entityColumnExists(entity: Entity, columnName: string): boolean {
  return entity.properties.some((property) => property.columnName === columnName);
}

function rejectedRelationDoubt(relation: ExtractRelation, reason: string): Doubt {
  return {
    topic: `relation:${relation.id}`,
    question: `Relationship "${relation.name}" (${relation.fromEntity}.${relation.fromColumn} → ${relation.toEntity}.${relation.toColumn}) was proposed by the LLM but could not be verified. Keep it?`,
    reason,
  };
}

export type RelationFromExtractResult =
  { kind: "relation"; relation: Relation } | { kind: "doubt"; doubt: Doubt } | { kind: "skip" };

export function relationFromExtract(
  relation: ExtractRelation,
  entityById: Map<string, Entity>,
  sourceTableByEntity: Map<string, string>,
): RelationFromExtractResult {
  const fromEntity = entityById.get(relation.fromEntity);
  const toEntity = entityById.get(relation.toEntity);
  if (fromEntity === undefined || toEntity === undefined) {
    return { kind: "skip" };
  }
  if (!entityColumnExists(fromEntity, relation.fromColumn)) {
    return {
      kind: "doubt",
      doubt: rejectedRelationDoubt(
        relation,
        `Column "${relation.fromColumn}" does not exist on entity "${relation.fromEntity}".`,
      ),
    };
  }
  if (!entityColumnExists(toEntity, relation.toColumn)) {
    return {
      kind: "doubt",
      doubt: rejectedRelationDoubt(
        relation,
        `Column "${relation.toColumn}" does not exist on entity "${relation.toEntity}".`,
      ),
    };
  }
  const evidence = profileForeignKeyEvidence(fromEntity, relation.fromColumn);
  if (evidence !== undefined && evidence.confidence < PROFILE_FK_OVERLAP_THRESHOLD) {
    return {
      kind: "doubt",
      doubt: rejectedRelationDoubt(
        relation,
        `Profile overlap for "${relation.fromEntity}.${relation.fromColumn}" (${evidence.confidence.toFixed(2)}) is below the foreign key threshold.`,
      ),
    };
  }
  const llmConfidence = relation.confidence ?? DEFAULT_LLM_RELATION_CONFIDENCE;
  const confidence =
    evidence !== undefined ? Math.min(llmConfidence, evidence.confidence) : llmConfidence;
  const fromTable = sourceTableByEntity.get(relation.fromEntity) ?? relation.fromEntity;
  return {
    kind: "relation",
    relation: {
      id: relation.id,
      name: relation.name,
      fromEntity: relation.fromEntity,
      toEntity: relation.toEntity,
      fromColumn: relation.fromColumn,
      toColumn: relation.toColumn,
      cardinality: relation.cardinality,
      status: "proposed",
      confidence,
      provenance: {
        table: fromTable,
        column: relation.fromColumn,
        evidence: relation.rationale ?? LLM_EVIDENCE,
        method: "llm",
      },
    },
  };
}

export function mergeGlossary(
  baseline: readonly GlossaryTerm[] | undefined,
  incoming: readonly GlossaryTerm[] | undefined,
): GlossaryTerm[] | undefined {
  if (incoming === undefined || incoming.length === 0) {
    return baseline === undefined ? undefined : [...baseline];
  }
  const byId = new Map<string, GlossaryTerm>();
  for (const term of baseline ?? []) {
    byId.set(term.id, term);
  }
  for (const term of incoming) {
    if (!byId.has(term.id)) {
      byId.set(term.id, term);
    }
  }
  return [...byId.values()];
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
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const sourceTableByEntity = new Map(entities.map((entity) => [entity.id, entity.sourceTable]));
  const existingRelationKeys = new Set(
    baseline.relations.map(
      (relation) =>
        `${relation.fromEntity}:${relation.fromColumn}->${relation.toEntity}:${relation.toColumn}`,
    ),
  );
  const addedRelations: Relation[] = [];
  const rejectedDoubts: Doubt[] = [];
  for (const relation of extract.relations ?? []) {
    const mapped = relationFromExtract(relation, entityById, sourceTableByEntity);
    if (mapped.kind === "doubt") {
      rejectedDoubts.push(mapped.doubt);
      continue;
    }
    if (mapped.kind === "skip") {
      continue;
    }
    const key = `${mapped.relation.fromEntity}:${mapped.relation.fromColumn}->${mapped.relation.toEntity}:${mapped.relation.toColumn}`;
    if (
      existingRelationKeys.has(key) ||
      baseline.relations.some((existing) => existing.id === mapped.relation.id)
    ) {
      continue;
    }
    existingRelationKeys.add(key);
    addedRelations.push(mapped.relation);
  }
  const relations = [...baseline.relations, ...addedRelations];
  const doubts = [...baseline.doubts, ...rejectedDoubts, ...(extract.doubts ?? [])];
  const questions = buildReviewQuestions(entities, relations, options.reviewConfidenceThreshold);
  const glossary = mergeGlossary(baseline.glossary, extract.glossary);
  return {
    ...baseline,
    entities,
    relations,
    doubts,
    questions,
    ...(glossary !== undefined ? { glossary } : {}),
  };
}
