import { DEFAULT_REVIEW_CONFIDENCE_THRESHOLD } from "@trybacked/core";
import type {
  DiscoveryReport,
  Entity,
  EvidenceTable,
  Ontology,
  OntologyProperty,
  OntologyPropertyType,
  Property,
  Proposal,
  Relation,
  ReviewQuestion,
  SemanticType,
} from "@trybacked/core";
import { relationshipToRelation } from "./enrich-proposal.js";

const ONTOLOGY_TO_SEMANTIC_TYPE: Record<OntologyPropertyType, SemanticType> = {
  string: "text",
  integer: "number",
  float: "number",
  decimal: "amount",
  boolean: "boolean",
  date: "date",
  datetime: "date",
  enum: "category",
  json: "text",
  reference: "identifier",
};

const DEFAULT_PROPERTY_CONFIDENCE = 0.75;
const DEFAULT_OBJECT_CONFIDENCE = 0.85;

function evidenceText(evidence: string | string[] | undefined): string {
  if (evidence === undefined) {
    return "schema_analysis";
  }
  return Array.isArray(evidence) ? evidence.join("; ") : evidence;
}

function propertyToModelProperty(property: OntologyProperty, table: string): Property {
  return {
    name: property.name,
    columnName: property.id,
    semanticType: ONTOLOGY_TO_SEMANTIC_TYPE[property.type],
    role: property.role ?? "attribute",
    nullable: property.nullable ?? true,
    confidence: property.confidence ?? DEFAULT_PROPERTY_CONFIDENCE,
    provenance: {
      table,
      column: property.id,
      evidence: evidenceText(property.provenance?.evidence),
    },
  };
}

function objectToEntity(object: Ontology["objects"][number]): Entity {
  const table = object.sourceDatasetId ?? object.id;
  return {
    id: object.id,
    name: object.name,
    ...(object.description !== undefined ? { description: object.description } : {}),
    sourceTable: table,
    status: "proposed",
    confidence: object.confidence ?? DEFAULT_OBJECT_CONFIDENCE,
    provenance: {
      table,
      evidence: evidenceText(object.provenance?.evidence),
    },
    properties: object.properties.map((property) => propertyToModelProperty(property, table)),
  };
}

function entityEvidence(entity: Entity): EvidenceTable {
  return {
    title: `Columns of ${entity.sourceTable}`,
    columns: ["Column", "Type", "Role"],
    rows: entity.properties.map((property) => [
      property.columnName,
      property.semanticType,
      property.role,
    ]),
  };
}

function relationEvidence(relation: Relation): EvidenceTable {
  return {
    title: `Relationship ${relation.id}`,
    columns: ["From", "To", "Cardinality"],
    rows: [
      [
        `${relation.fromEntity}.${relation.fromColumn}`,
        `${relation.toEntity}.${relation.toColumn}`,
        relation.cardinality,
      ],
    ],
  };
}

function entityQuestion(entity: Entity): ReviewQuestion {
  const uncertainty = 1 - entity.confidence;
  return {
    id: `q_entity_${entity.id}`,
    kind: "entity",
    targetId: entity.id,
    question: `Keep object "${entity.name}" discovered from dataset "${entity.sourceTable}"?`,
    impact: entity.properties.length,
    uncertainty,
    risk: uncertainty * entity.properties.length,
    evidence: entityEvidence(entity),
  };
}

function relationQuestion(relation: Relation): ReviewQuestion {
  const uncertainty = 1 - relation.confidence;
  return {
    id: `q_relation_${relation.id}`,
    kind: "relation",
    targetId: relation.id,
    question: `Keep relationship "${relation.name}" (${relation.fromEntity} → ${relation.toEntity})?`,
    impact: 1,
    uncertainty,
    risk: uncertainty,
    evidence: relationEvidence(relation),
  };
}

export type ProposalFromDiscoveryOptions = {
  runId: string;
  generatedAt?: string;
  reviewConfidenceThreshold?: number;
};

/**
 * Converts a deterministic discovery report into a review proposal.
 * Elements below the review confidence threshold get a question;
 * elements at or above it are auto-confirmed by `applyReview`.
 */
export function proposalFromDiscovery(
  discovery: DiscoveryReport,
  options: ProposalFromDiscoveryOptions,
): Proposal {
  const threshold = options.reviewConfidenceThreshold ?? DEFAULT_REVIEW_CONFIDENCE_THRESHOLD;
  const entities = discovery.ontology.objects.map(objectToEntity);
  const relations = discovery.ontology.relationships
    .map((relationship) => relationshipToRelation(relationship, entities))
    .filter((relation): relation is Relation => relation !== null);
  const questions: ReviewQuestion[] = [
    ...entities.filter((entity) => entity.confidence < threshold).map(entityQuestion),
    ...relations.filter((relation) => relation.confidence < threshold).map(relationQuestion),
  ].sort((a, b) => b.risk - a.risk);
  return {
    runId: options.runId,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    entities,
    relations,
    rules: [],
    doubts: [],
    questions,
  };
}
