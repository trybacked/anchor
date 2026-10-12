import type { Ontology, OntologyPropertyType } from "./spec.js";
import { ONTOLOGY_FORMAT_VERSION } from "./spec.js";
import type { OntologyPropertyV2, OntologyTypeExpr, OntologyV2 } from "./spec-v2.js";

const V2_SCALAR_TO_V1: Record<string, OntologyPropertyType> = {
  string: "string",
  integer: "integer",
  long: "integer",
  double: "float",
  decimal: "decimal",
  boolean: "boolean",
  date: "date",
  timestamp: "datetime",
  geopoint: "json",
  reference: "reference",
  attachment: "string",
  json: "json",
};

function v2TypeToV1(type: OntologyTypeExpr): OntologyPropertyType {
  if (typeof type !== "string") {
    return "json";
  }
  return V2_SCALAR_TO_V1[type] ?? "string";
}

function isPhysicalProperty(
  property: OntologyPropertyV2,
): property is Extract<OntologyPropertyV2, { kind: "physical" }> {
  return property.kind === "physical";
}

export function ontologyV2ToOntology(v2: OntologyV2): Ontology {
  return {
    metadata: {
      formatVersion: ONTOLOGY_FORMAT_VERSION,
      id: v2.metadata.id,
      version: v2.metadata.version,
      generatedAt: v2.metadata.generatedAt ?? new Date().toISOString(),
    },
    objects: v2.objectTypes.map((objectType) => ({
      id: objectType.id,
      name: objectType.name,
      description: objectType.description,
      sourceDatasetId: objectType.backing[0]?.datasetId,
      status: objectType.status ?? "confirmed",
      confidence: objectType.confidence ?? 1,
      provenance: objectType.provenance?.evidence
        ? {
            table: objectType.backing[0]?.datasetId ?? "unknown",
            evidence:
              typeof objectType.provenance.evidence === "string"
                ? objectType.provenance.evidence
                : objectType.provenance.evidence.join("; "),
          }
        : { table: "unknown", evidence: "v2_bridge" },
      source: objectType.source ?? "inferred",
      semantics: objectType.semantics,
      properties: objectType.properties.filter(isPhysicalProperty).map((property) => ({
        id: property.id,
        name: property.name,
        type: v2TypeToV1(property.type),
        role: property.role ?? "attribute",
        nullable: property.nullable ?? true,
        confidence: property.confidence ?? 1,
        provenance: property.provenance?.evidence
          ? {
              table: objectType.backing[0]?.datasetId ?? "unknown",
              column: property.column,
              evidence:
                typeof property.provenance.evidence === "string"
                  ? property.provenance.evidence
                  : property.provenance.evidence.join("; "),
            }
          : { table: "unknown", evidence: "v2_bridge" },
        source: property.source ?? "inferred",
        semantics: property.semantics,
      })),
    })),
    relationships: v2.linkTypes.map((link) => ({
      id: link.id,
      name: link.name,
      fromObjectId: link.fromObjectTypeId,
      toObjectId: link.toObjectTypeId,
      fromPropertyId: link.keyMappings[0]?.fromPropertyId,
      toPropertyId: link.keyMappings[0]?.toPropertyId,
      cardinality: link.cardinality,
      status: link.status ?? "confirmed",
      confidence: link.confidence ?? 1,
      provenance: link.provenance?.evidence
        ? {
            table: "unknown",
            evidence:
              typeof link.provenance.evidence === "string"
                ? link.provenance.evidence
                : link.provenance.evidence.join("; "),
          }
        : { table: "unknown", evidence: "v2_bridge" },
      source: link.source ?? "inferred",
    })),
    logic: [],
    actions: [],
    semantics: v2.semantics,
  };
}
