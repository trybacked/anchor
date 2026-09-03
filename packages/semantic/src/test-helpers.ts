/** Shared builders for semantic unit tests — a pmi-minimal-like profile. */

import type { ColumnProfile, ProfileReport } from "@backed/core";

export function buildColumn(overrides: Partial<ColumnProfile> & { name: string }): ColumnProfile {
  return {
    sqlType: "VARCHAR",
    nullCount: 0,
    nullRatio: 0,
    distinctCount: 1,
    min: null,
    max: null,
    topValues: [],
    patterns: [],
    ...overrides,
  };
}

export function buildPmiProfile(): ProfileReport {
  return [
    {
      table: "clienti",
      sourceFile: "clienti.csv",
      rowCount: 8,
      columns: [
        buildColumn({
          name: "id",
          sqlType: "BIGINT",
          distinctCount: 8,
          topValues: [
            { value: "1", count: 1 },
            { value: "2", count: 1 },
          ],
        }),
        buildColumn({
          name: "ragione_sociale",
          distinctCount: 8,
          topValues: [{ value: "Arredamenti Blu S.r.l.", count: 1 }],
        }),
        buildColumn({
          name: "partita_iva",
          distinctCount: 8,
          patterns: [{ kind: "vat_number", matchRatio: 1 }],
          topValues: [{ value: "01234567890", count: 1 }],
        }),
        buildColumn({
          name: "email",
          distinctCount: 8,
          patterns: [{ kind: "email", matchRatio: 1 }],
          topValues: [{ value: "info@arredamentiblu.it", count: 1 }],
        }),
      ],
    },
    {
      table: "fatture",
      sourceFile: "fatture.csv",
      rowCount: 12,
      columns: [
        buildColumn({
          name: "numero",
          distinctCount: 12,
          topValues: [{ value: "2024-0001", count: 1 }],
        }),
        buildColumn({
          name: "data",
          sqlType: "DATE",
          distinctCount: 12,
          patterns: [{ kind: "date", matchRatio: 1 }],
        }),
        buildColumn({
          name: "cliente_id",
          sqlType: "BIGINT",
          distinctCount: 8,
          topValues: [
            { value: "1", count: 3 },
            { value: "2", count: 2 },
          ],
        }),
        buildColumn({
          name: "importo",
          sqlType: "DOUBLE",
          distinctCount: 12,
          patterns: [{ kind: "amount", matchRatio: 1 }],
        }),
        buildColumn({
          name: "stato",
          distinctCount: 3,
          topValues: [
            { value: "pagata", count: 7 },
            { value: "emessa", count: 3 },
            { value: "insoluta", count: 2 },
          ],
        }),
      ],
    },
  ];
}
