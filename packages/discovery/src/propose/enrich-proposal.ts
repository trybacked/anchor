import type { DiscoveryReport } from "@trybacked/core";
import type { Cardinality, Entity, Proposal, Relation } from "@trybacked/core";

function resolveEntityId(entities: Entity[], tableOrId: string): string | undefined {
  const byId = entities.find((entity) => entity.id === tableOrId);
  if (byId !== undefined) {
    return byId.id;
  }
  return entities.find((entity) => entity.sourceTable === tableOrId)?.id;
}

function mapCardinality(cardinality: string): Cardinality {
  switch (cardinality) {
    case "one_to_one":
    case "one_to_many":
    case "many_to_many":
      return cardinality;
    case "many_to_one":
      return "one_to_many";
    default:
      return "one_to_many";
  }
}

function provenanceEvidence(evidence: string | string[]): string {
  return Array.isArray(evidence) ? evidence.join("; ") : evidence;
}

export function relationshipToRelation(
  relationship: DiscoveryReport["ontology"]["relationships"][number],
  entities: Entity[],
): Relation | null {
  const fromEntity = resolveEntityId(entities, relationship.fromObjectId);
  const toEntity = resolveEntityId(entities, relationship.toObjectId);
  if (fromEntity === undefined || toEntity === undefined) {
    return null;
  }
  const fromColumn = relationship.fromPropertyId ?? "id";
  const toColumn = relationship.toPropertyId ?? "id";
  const fromTable =
    entities.find((entity) => entity.id === fromEntity)?.sourceTable ?? relationship.fromObjectId;
  return {
    id: relationship.id,
    name: relationship.name,
    fromEntity,
    toEntity,
    fromColumn,
    toColumn,
    cardinality: mapCardinality(relationship.cardinality),
    status: "proposed",
    confidence: relationship.confidence ?? 0.85,
    provenance: {
      table: fromTable,
      column: fromColumn,
      evidence: provenanceEvidence(relationship.provenance?.evidence ?? "schema_analysis"),
    },
  };
}

export type EnrichProposalFromDiscoveryResult = {
  proposal: Proposal;
  addedRelationIds: string[];
};

/** Adds schema-derived relations missing from the LLM proposal (non-destructive merge). */
export function enrichProposalFromDiscovery(
  proposal: Proposal,
  discovery: DiscoveryReport,
): EnrichProposalFromDiscoveryResult {
  const existingRelationIds = new Set(proposal.relations.map((relation) => relation.id));
  const addedRelations: Relation[] = [];

  for (const relationship of discovery.ontology.relationships) {
    if (existingRelationIds.has(relationship.id)) {
      continue;
    }
    const relation = relationshipToRelation(relationship, proposal.entities);
    if (relation === null) {
      continue;
    }
    const duplicate = proposal.relations.some(
      (existing) =>
        existing.fromEntity === relation.fromEntity &&
        existing.toEntity === relation.toEntity &&
        existing.fromColumn === relation.fromColumn &&
        existing.toColumn === relation.toColumn,
    );
    if (duplicate) {
      continue;
    }
    addedRelations.push(relation);
    existingRelationIds.add(relation.id);
  }

  if (addedRelations.length === 0) {
    return { proposal, addedRelationIds: [] };
  }

  return {
    proposal: {
      ...proposal,
      relations: [...proposal.relations, ...addedRelations],
    },
    addedRelationIds: addedRelations.map((relation) => relation.id),
  };
}
