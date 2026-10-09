import type { ForeignKeyCandidate, ProfileReport } from "@trybacked/core";

type FkHint = { targetTable: string; targetColumn: string };

const FOUNDRY_COLUMN_FK_HINTS: Record<string, Record<string, FkHint>> = {
  document_entities: {
    document_id: { targetTable: "documents", targetColumn: "document_id" },
  },
  document_organization_mentions: {
    document_id: { targetTable: "documents", targetColumn: "document_id" },
    organization_normalized_name: {
      targetTable: "organization_profiles",
      targetColumn: "normalized_name",
    },
  },
  document_person_mentions: {
    document_id: { targetTable: "documents", targetColumn: "document_id" },
    person_normalized_name: { targetTable: "person_profiles", targetColumn: "normalized_name" },
  },
  document_topic_mentions: {
    document_id: { targetTable: "documents", targetColumn: "document_id" },
    topic_normalized_name: { targetTable: "topic_profiles", targetColumn: "normalized_name" },
  },
  document_legal_instrument_mentions: {
    document_id: { targetTable: "documents", targetColumn: "document_id" },
    legal_instrument_normalized_name: {
      targetTable: "legal_instrument_profiles",
      targetColumn: "normalized_name",
    },
  },
  person_organization_affiliations: {
    person_normalized_name: { targetTable: "person_profiles", targetColumn: "normalized_name" },
    organization_normalized_name: {
      targetTable: "organization_profiles",
      targetColumn: "normalized_name",
    },
  },
  organization_profiles: {
    first_seen_document_id: { targetTable: "documents", targetColumn: "document_id" },
    last_seen_document_id: { targetTable: "documents", targetColumn: "document_id" },
  },
  person_profiles: {
    first_seen_document_id: { targetTable: "documents", targetColumn: "document_id" },
    last_seen_document_id: { targetTable: "documents", targetColumn: "document_id" },
  },
  topic_profiles: {
    first_seen_document_id: { targetTable: "documents", targetColumn: "document_id" },
    last_seen_document_id: { targetTable: "documents", targetColumn: "document_id" },
  },
  legal_instrument_profiles: {
    first_seen_document_id: { targetTable: "documents", targetColumn: "document_id" },
    last_seen_document_id: { targetTable: "documents", targetColumn: "document_id" },
  },
  military_asset_profiles: {
    first_seen_document_id: { targetTable: "documents", targetColumn: "document_id" },
    last_seen_document_id: { targetTable: "documents", targetColumn: "document_id" },
  },
};

function hintToCandidate(hint: FkHint): ForeignKeyCandidate {
  return {
    targetTable: hint.targetTable,
    targetColumn: hint.targetColumn,
    overlapRatio: 0.95,
    confidence: 0.92,
  };
}

export function applyFoundryForeignKeyHints(profile: ProfileReport): ProfileReport {
  const tableNames = new Set(profile.map((table) => table.table));
  return profile.map((table) => {
    const columnHints = FOUNDRY_COLUMN_FK_HINTS[table.table];
    if (columnHints === undefined) {
      return table;
    }
    return {
      ...table,
      columns: table.columns.map((column) => {
        if (column.foreignKeyCandidates.length > 0) {
          return column;
        }
        const hint = columnHints[column.name];
        if (hint === undefined || !tableNames.has(hint.targetTable)) {
          return column;
        }
        return {
          ...column,
          foreignKeyCandidates: [hintToCandidate(hint)],
        };
      }),
    };
  });
}
