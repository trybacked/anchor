import { describe, expect, it } from "vitest";

import { COMPRESSED_TOP_VALUES_LIMIT, compressProfile } from "./compress.js";
import { buildColumn, buildPmiProfile } from "./test-helpers.js";

describe("compressProfile", () => {
  it("keeps only statistics, names, patterns and top values", () => {
    const [clienti] = compressProfile(buildPmiProfile());

    expect(clienti?.table).toBe("clienti");
    expect(clienti?.rowCount).toBe(8);
    const partitaIva = clienti?.columns.find((column) => column.name === "partita_iva");
    expect(partitaIva).toEqual({
      name: "partita_iva",
      sqlType: "VARCHAR",
      nullRatio: 0,
      distinctCount: 8,
      isCandidateKey: true,
      patterns: ["vat_number"],
      topValues: ["01234567890"],
    });
  });

  it("marks candidate keys only when distinct = rows and no nulls", () => {
    const [clienti, fatture] = compressProfile(buildPmiProfile());

    expect(clienti?.candidateKeys).toContain("id");
    expect(fatture?.candidateKeys).toContain("numero");
    expect(fatture?.candidateKeys).not.toContain("cliente_id");
    expect(fatture?.candidateKeys).not.toContain("stato");
  });

  it("caps and truncates top values", () => {
    const longValue = "x".repeat(100);
    const report = [
      {
        table: "t",
        sourceFile: "t.csv",
        rowCount: 10,
        columns: [
          buildColumn({
            name: "c",
            distinctCount: 8,
            topValues: Array.from({ length: 10 }, (_, index) => ({
              value: index === 0 ? longValue : `v${String(index)}`,
              count: 1,
            })),
          }),
        ],
      },
    ];

    const [table] = compressProfile(report);
    const column = table?.columns[0];
    expect(column?.topValues).toHaveLength(COMPRESSED_TOP_VALUES_LIMIT);
    expect(column?.topValues[0]?.length).toBeLessThanOrEqual(41);
  });
});
