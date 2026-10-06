import type { ProfileReport, Proposal } from "@trybacked/core";
import type { DocTableSample } from "./collect-samples.js";

function compactProfile(profile: ProfileReport): unknown[] {
  return profile.map((table) => ({
    table: table.table,
    rowCount: table.rowCount,
    columns: table.columns.map((column) => ({
      name: column.name,
      sqlType: column.sqlType,
      nullRatio: column.nullRatio,
      distinctCount: column.distinctCount,
    })),
  }));
}

function baselineSummary(proposal: Proposal): unknown {
  return proposal.entities.map((entity) => ({
    id: entity.id,
    name: entity.name,
    sourceTable: entity.sourceTable,
    properties: entity.properties.map((property) => ({
      columnName: property.columnName,
      name: property.name,
      semanticType: property.semanticType,
      role: property.role,
    })),
  }));
}

export function buildOntologyExtractUserPrompt(options: {
  profile: ProfileReport;
  proposal: Proposal;
  samples: readonly DocTableSample[];
  localeHint?: string | undefined;
}): string {
  const payload = {
    localeHint: options.localeHint ?? null,
    schemaProfile: compactProfile(options.profile),
    baselineEntities: baselineSummary(options.proposal),
    rowSamples: options.samples,
  };
  return JSON.stringify(payload, null, 2);
}

export const ONTOLOGY_EXTRACT_SYSTEM_PROMPT = [
  "You are an ontology author for a governed semantic layer over a document archive (PDFs parsed into SQL tables).",
  "Given warehouse column statistics and text samples, refine human-readable object names, descriptions, property semantics, display labels, and relationships.",
  "Stay grounded: every entity id and columnName must exist in the baseline payload. Prefer Italian labels when localeHint is it.",
  "Raise confidence when evidence is strong; lower it when ambiguous. Put unresolved ambiguity in doubts.",
].join("\n");
