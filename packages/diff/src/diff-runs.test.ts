import type { ColumnProfile, Entity, ProfileReport, Relation, Rule } from "@backed/core";
import { describe, expect, it } from "vitest";

import { diffRuns } from "./diff-runs.js";
import type { ModelElements } from "./diff-runs.js";
import { formatDiff } from "./format.js";

const NOW = new Date("2026-09-03T12:00:00.000Z");

function buildColumn(name: string, sqlType = "VARCHAR"): ColumnProfile {
  return {
    name,
    sqlType,
    nullCount: 0,
    nullRatio: 0,
    distinctCount: 1,
    min: null,
    max: null,
    topValues: [],
    patterns: [],
  };
}

function buildProfile(tables: Record<string, ColumnProfile[]>): ProfileReport {
  return Object.entries(tables).map(([table, columns]) => ({
    table,
    sourceFile: `${table}.csv`,
    rowCount: 10,
    columns,
  }));
}

function buildEntity(id: string, sourceTable: string): Entity {
  return {
    id,
    name: id,
    sourceTable,
    status: "confirmed",
    confidence: 0.9,
    provenance: { table: sourceTable, evidence: "test" },
    properties: [],
  };
}

function buildRelation(id: string): Relation {
  return {
    id,
    name: id,
    fromEntity: "fattura",
    toEntity: "cliente",
    fromColumn: "cliente_id",
    toColumn: "id",
    cardinality: "one_to_many",
    status: "confirmed",
    confidence: 0.9,
    provenance: { table: "fatture", column: "cliente_id", evidence: "test" },
  };
}

function buildRule(id: string): Rule {
  return {
    id,
    name: id,
    definition: "Definizione.",
    appliesTo: "fattura",
    status: "confirmed",
    confidence: 0.9,
    provenance: { table: "fatture", evidence: "test" },
  };
}

const BASE_PROFILE = buildProfile({
  clienti: [buildColumn("id", "BIGINT"), buildColumn("email")],
  fatture: [buildColumn("numero"), buildColumn("cliente_id", "BIGINT"), buildColumn("importo", "DOUBLE")],
});

const BASE_MODEL: ModelElements = {
  entities: [buildEntity("cliente", "clienti"), buildEntity("fattura", "fatture")],
  relations: [buildRelation("fattura-cliente")],
  rules: [buildRule("fattura-insoluta")],
};

describe("diffRuns", () => {
  it("reports no changes for identical runs", () => {
    const diff = diffRuns(
      { runId: "run-1", profile: BASE_PROFILE, model: BASE_MODEL },
      { runId: "run-2", profile: BASE_PROFILE, model: BASE_MODEL },
      NOW,
    );
    expect(diff.changes).toHaveLength(0);
    expect(formatDiff(diff)).toContain("No changes detected");
  });

  it("detects added/removed tables and columns and type changes", () => {
    const nextProfile = buildProfile({
      clienti: [buildColumn("id", "VARCHAR"), buildColumn("telefono")],
      prodotti: [buildColumn("codice")],
    });

    const diff = diffRuns(
      { runId: "run-1", profile: BASE_PROFILE },
      { runId: "run-2", profile: nextProfile },
      NOW,
    );

    const kinds = diff.changes.map((change) => change.kind).sort();
    expect(kinds).toEqual([
      "column_added",
      "column_removed",
      "column_type_changed",
      "table_added",
      "table_removed",
    ]);
    const typeChange = diff.changes.find((change) => change.kind === "column_type_changed");
    expect(typeChange).toMatchObject({ subject: "clienti.id", before: "BIGINT", after: "VARCHAR" });
  });

  it("distinguishes a broken relation from a removed one", () => {
    // Broken: the anchoring column cliente_id disappeared from the profile.
    const profileWithoutFk = buildProfile({
      clienti: [buildColumn("id", "BIGINT"), buildColumn("email")],
      fatture: [buildColumn("numero"), buildColumn("importo", "DOUBLE")],
    });
    const nextModel: ModelElements = { ...BASE_MODEL, relations: [] };

    const broken = diffRuns(
      { runId: "run-1", profile: BASE_PROFILE, model: BASE_MODEL },
      { runId: "run-2", profile: profileWithoutFk, model: nextModel },
      NOW,
    );
    expect(broken.changes.some((change) => change.kind === "relation_broken")).toBe(true);

    // Removed: columns still exist, the relation simply left the model.
    const removed = diffRuns(
      { runId: "run-1", profile: BASE_PROFILE, model: BASE_MODEL },
      { runId: "run-2", profile: BASE_PROFILE, model: nextModel },
      NOW,
    );
    expect(removed.changes.some((change) => change.kind === "relation_removed")).toBe(true);
    expect(removed.changes.some((change) => change.kind === "relation_broken")).toBe(false);
  });

  it("detects disappeared entities and rules", () => {
    const nextModel: ModelElements = {
      entities: [buildEntity("cliente", "clienti")],
      relations: [],
      rules: [],
    };
    const diff = diffRuns(
      { runId: "run-1", profile: BASE_PROFILE, model: BASE_MODEL },
      { runId: "run-2", profile: BASE_PROFILE, model: nextModel },
      NOW,
    );

    expect(diff.changes.some((change) => change.kind === "entity_removed")).toBe(true);
    expect(diff.changes.some((change) => change.kind === "rule_removed")).toBe(true);
  });

  it("renders a readable report", () => {
    const nextProfile = buildProfile({
      clienti: [buildColumn("id", "BIGINT"), buildColumn("email"), buildColumn("telefono")],
      fatture: [buildColumn("numero"), buildColumn("cliente_id", "BIGINT"), buildColumn("importo", "DOUBLE")],
    });
    const diff = diffRuns(
      { runId: "run-1", profile: BASE_PROFILE },
      { runId: "run-2", profile: nextProfile },
      NOW,
    );

    const report = formatDiff(diff);
    expect(report).toContain("run-1 → run-2");
    expect(report).toContain('+ New column "telefono"');
  });
});
