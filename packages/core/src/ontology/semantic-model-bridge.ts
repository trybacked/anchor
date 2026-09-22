import type { SemanticModel } from "../model.js";
import type { Ontology, OntologyPropertyType } from "./spec.js";
import { ONTOLOGY_FORMAT_VERSION } from "./spec.js";

const SEMANTIC_TO_ONTOLOGY_TYPE: Record<string, OntologyPropertyType> = {
  text: "string",
  number: "float",
  amount: "decimal",
  date: "date",
  boolean: "boolean",
  identifier: "string",
  email: "string",
  vat_number: "string",
  fiscal_code: "string",
  category: "string",
};

function mapPropertyType(semanticType: string): OntologyPropertyType {
  return SEMANTIC_TO_ONTOLOGY_TYPE[semanticType] ?? "string";
}

/**
 * Maps a v1 {@link SemanticModel} into the canonical {@link Ontology} shape for validation and future export.
 * Display names become property ids via columnName (stable within the source dataset).
 */
export function semanticModelToOntology(
  model: SemanticModel,
  options: { ontologyId: string; version?: number },
): Ontology {
  const version = options.version ?? 1;
  return {
    metadata: {
      formatVersion: ONTOLOGY_FORMAT_VERSION,
      id: options.ontologyId,
      version,
      generatedAt: model.metadata.generatedAt,
    },
    objects: model.entities.map((entity) => ({
      id: entity.id,
      name: entity.name,
      description: entity.description,
      sourceDatasetId: entity.sourceTable,
      status: entity.status,
      confidence: entity.confidence,
      provenance: {
        table: entity.provenance.table,
        column: entity.provenance.column,
        evidence: entity.provenance.evidence,
      },
      source: "inferred" as const,
      properties: entity.properties.map((property) => ({
        id: property.columnName,
        name: property.name,
        type: mapPropertyType(property.semanticType),
        role: property.role,
        nullable: property.nullable,
        confidence: property.confidence,
        provenance: {
          table: property.provenance.table,
          column: property.provenance.column,
          evidence: property.provenance.evidence,
        },
        source: "inferred" as const,
      })),
    })),
    relationships: model.relations.map((relation) => ({
      id: relation.id,
      name: relation.name,
      fromObjectId: relation.fromEntity,
      toObjectId: relation.toEntity,
      fromPropertyId: relation.fromColumn,
      toPropertyId: relation.toColumn,
      cardinality: relation.cardinality,
      status: relation.status,
      confidence: relation.confidence,
      provenance: {
        table: relation.provenance.table,
        column: relation.provenance.column,
        evidence: relation.provenance.evidence,
      },
      source: "inferred" as const,
    })),
    logic: model.rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      objectId: rule.appliesTo,
      expression: rule.definition,
      status: rule.status,
      confidence: rule.confidence,
      provenance: {
        table: rule.provenance.table,
        column: rule.provenance.column,
        evidence: rule.provenance.evidence,
      },
      source: "inferred" as const,
    })),
    actions: [],
  };
}
