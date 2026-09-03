import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ProfileReportSchema } from "@backed/core";
import type { ProfileReport, TableProfile } from "@backed/core";
import { ingestFolder } from "@backed/ingest";
import type { IngestSession } from "@backed/ingest";

import { profileTables } from "./index.js";

const FIXTURE_PATH = fileURLToPath(
  new URL("../../../fixtures/pmi-minimal", import.meta.url),
);

let session: IngestSession;
let report: ProfileReport;

beforeAll(async () => {
  session = await ingestFolder(FIXTURE_PATH);
  report = await profileTables(session);
});

afterAll(() => {
  session.close();
});

function tableByName(name: string): TableProfile {
  const table = report.find((profile) => profile.table === name);
  if (table === undefined) {
    throw new Error(`Table not profiled: ${name}`);
  }
  return table;
}

function columnByName(table: TableProfile, name: string) {
  const column = table.columns.find((candidate) => candidate.name === name);
  if (column === undefined) {
    throw new Error(`Colonna non profilata: ${table.table}.${name}`);
  }
  return column;
}

describe("profileTables on pmi-minimal", () => {
  it("profiles every registered dataset", () => {
    expect(report.map((profile) => profile.table).sort()).toEqual([
      "clienti",
      "fatture",
      "prodotti",
    ]);
  });

  it("computes row counts and column stats for fatture", () => {
    const fatture = tableByName("fatture");
    expect(fatture.rowCount).toBe(12);

    const importo = columnByName(fatture, "importo");
    expect(importo.sqlType).toBe("DOUBLE");
    expect(importo.nullCount).toBe(0);
    expect(importo.distinctCount).toBe(12);
    expect(Number(importo.min)).toBeCloseTo(78.2);
    expect(Number(importo.max)).toBeCloseTo(3200);
    expect(importo.patterns).toEqual([{ kind: "amount", matchRatio: 1 }]);

    const stato = columnByName(fatture, "stato");
    expect(stato.distinctCount).toBe(3);
    expect(stato.topValues[0]).toEqual({ value: "pagata", count: 7 });
  });

  it("detects the date column converted from gg/mm/aaaa", () => {
    const data = columnByName(tableByName("fatture"), "data");
    expect(data.sqlType).toBe("DATE");
    expect(data.patterns).toEqual([{ kind: "date", matchRatio: 1 }]);
    expect(data.min).toBe("2024-01-15");
    expect(data.max).toBe("2024-06-09");
  });

  it("detects Italian identifier patterns in clienti", () => {
    const clienti = tableByName("clienti");
    expect(clienti.rowCount).toBe(8);

    const patternKinds = (columnName: string): string[] =>
      columnByName(clienti, columnName).patterns.map((pattern) => pattern.kind);

    expect(patternKinds("partita_iva")).toContain("vat_number");
    expect(patternKinds("codice_fiscale")).toContain("fiscal_code");
    expect(patternKinds("email")).toContain("email");
  });

  it("counts nulls for empty fiscal codes", () => {
    const codiceFiscale = columnByName(tableByName("clienti"), "codice_fiscale");
    expect(codiceFiscale.nullCount).toBe(3);
    expect(codiceFiscale.nullRatio).toBeCloseTo(3 / 8);
    expect(codiceFiscale.distinctCount).toBe(5);
  });

  it("preserves accented values read from Windows-1252", () => {
    const citta = columnByName(tableByName("clienti"), "citta");
    const values = citta.topValues.map((topValue) => topValue.value);
    expect(values).toContain("Forlì");
    expect(values).toContain("Cefalù");
  });

  it("marks dot-decimal prices as amounts", () => {
    const prezzo = columnByName(tableByName("prodotti"), "prezzo");
    expect(prezzo.sqlType).toBe("DOUBLE");
    expect(prezzo.patterns).toEqual([{ kind: "amount", matchRatio: 1 }]);
  });

  it("produces JSON-serializable output that round-trips the Zod schema", () => {
    const serialized = JSON.stringify(report);
    expect(() =>
      ProfileReportSchema.parse(JSON.parse(serialized)),
    ).not.toThrow();
  });
});
