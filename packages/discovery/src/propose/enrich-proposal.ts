import {
  parseRelationshipCardinality,
  type DiscoveryReport,
  type Entity,
  type Proposal,
  type Relation,
} from "@trybacked/core";
function resolveEntityId(entities: Entity[], tableOrId: string): string | undefined {
  const byId = entities.find((entity) => entity.id === tableOrId);
  if (byId !== undefined) {
    return byId.id;
  }
  return entities.find((entity) => entity.sourceTable === tableOrId)?.id;
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
    cardinality: parseRelationshipCardinality(relationship.cardinality),
    status: "proposed",
    confidence: relationship.confidence ?? 0.85,
    provenance: {
      table: fromTable,
      column: fromColumn,
      evidence: provenanceEvidence(relationship.provenance?.evidence ?? "schema_analysis"),
      method: "profile",
    },
  };
}
export type EnrichProposalFromDiscoveryResult = {
  proposal: Proposal;
  addedRelationIds: string[];
};
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
