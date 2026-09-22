import type {
  ColumnProfile,
  DiscoveryReport,
  ForeignKeyCandidate,
  Ontology,
  OntologyObject,
  OntologyProperty,
  OntologyRelationship,
  ProfileReport,
  TableProfile,
} from "@trybacked/core";
import { ONTOLOGY_FORMAT_VERSION, PIPELINE_INFRA_DATASET_TABLE_NAMES } from "@trybacked/core";
import { inspectProfileReport } from "../inspect/inspect-profile.js";
import { inferPropertyType } from "../inspect/sql-type.js";

const INFRA_TABLES = new Set<string>(PIPELINE_INFRA_DATASET_TABLE_NAMES);
const PROPOSED = "proposed" as const;
const INFERRED = "inferred" as const;
const DISCOVERY_TYPE = "schema_analysis" as const;

function humanizeIdentifier(value: string): string {
  return value
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function isPrimaryKeyCandidate(column: ColumnProfile, rowCount: number): boolean {
  return rowCount > 0 && column.nullCount === 0 && column.distinctCount === rowCount;
}

function columnEvidence(table: TableProfile, column: ColumnProfile): string[] {
  return [
    `${table.table}.${column.name}`,
    `${column.sqlType} null_ratio=${column.nullRatio.toFixed(2)}`,
  ];
}

function discoverProperty(table: TableProfile, column: ColumnProfile): OntologyProperty {
  const role = isPrimaryKeyCandidate(column, table.rowCount)
    ? ("primary_key" as const)
    : column.foreignKeyCandidates.length > 0
      ? ("foreign_key" as const)
      : ("attribute" as const);
  const bestFk = column.foreignKeyCandidates[0];
  return {
    id: column.name,
    name: humanizeIdentifier(column.name),
    type: inferPropertyType(column.sqlType, column.patterns),
    role,
    nullable: column.nullCount > 0,
    confidence: role === "primary_key" ? 0.95 : (bestFk?.confidence ?? 0.75),
    provenance: {
      type: DISCOVERY_TYPE,
      table: table.table,
      column: column.name,
      evidence: columnEvidence(table, column),
    },
    status: PROPOSED,
    lifecycle: "discovered" as const,
    source: INFERRED,
    ...(bestFk !== undefined ? { referenceObjectId: bestFk.targetTable } : {}),
  };
}

function discoverObject(table: TableProfile): OntologyObject {
  return {
    id: table.table,
    name: humanizeIdentifier(table.table),
    sourceDatasetId: table.table,
    properties: table.columns.map((column) => discoverProperty(table, column)),
    confidence: 0.85,
    provenance: {
      type: DISCOVERY_TYPE,
      table: table.table,
      evidence: [
        `Dataset "${table.table}" from ${table.sourceFile}`,
        `${String(table.rowCount)} rows, ${String(table.columns.length)} columns`,
      ],
    },
    status: PROPOSED,
    lifecycle: "discovered" as const,
    source: INFERRED,
  };
}

function relationshipId(fromTable: string, fromColumn: string, toTable: string): string {
  return `${fromTable}__${fromColumn}__${toTable}`;
}

function discoverRelationship(
  fromTable: TableProfile,
  fromColumn: ColumnProfile,
  candidate: ForeignKeyCandidate,
): OntologyRelationship {
  return {
    id: relationshipId(fromTable.table, fromColumn.name, candidate.targetTable),
    name: humanizeIdentifier(`${fromColumn.name} to ${candidate.targetTable}`),
    fromObjectId: fromTable.table,
    toObjectId: candidate.targetTable,
    fromPropertyId: fromColumn.name,
    toPropertyId: candidate.targetColumn,
    cardinality: "many_to_one",
    confidence: candidate.confidence,
    provenance: {
      type: DISCOVERY_TYPE,
      table: fromTable.table,
      column: fromColumn.name,
      evidence: [
        `${fromTable.table}.${fromColumn.name}`,
        `${candidate.targetTable}.${candidate.targetColumn}`,
        `overlap=${candidate.overlapRatio.toFixed(3)}`,
      ],
    },
    status: PROPOSED,
    lifecycle: "discovered" as const,
    source: INFERRED,
  };
}

export type DiscoverFromProfileOptions = {
  ontologyId: string;
  version?: number;
};

export function discoverFromProfile(
  profile: ProfileReport,
  options: DiscoverFromProfileOptions,
): DiscoveryReport {
  const eligible = profile.filter((table) => !INFRA_TABLES.has(table.table));
  const objects = eligible.map(discoverObject);
  const relationships: OntologyRelationship[] = [];
  for (const table of eligible) {
    for (const column of table.columns) {
      const candidate = column.foreignKeyCandidates[0];
      if (candidate === undefined) {
        continue;
      }
      relationships.push(discoverRelationship(table, column, candidate));
    }
  }

  const ontology: Ontology = {
    metadata: {
      formatVersion: ONTOLOGY_FORMAT_VERSION,
      id: options.ontologyId,
      version: options.version ?? 1,
      generatedAt: new Date().toISOString(),
    },
    objects,
    relationships,
    logic: [],
    actions: [],
  };

  return {
    inspection: inspectProfileReport(profile),
    ontology,
  };
}
