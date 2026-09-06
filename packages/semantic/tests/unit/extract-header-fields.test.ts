import { describe, expect, it } from "vitest";

import { extractHeaderFields, isOcrNoiseLine } from "../../src/extract-header-fields.js";

describe("isOcrNoiseLine", () => {
  it("rejects dash-only OCR separator lines", () => {
    expect(isOcrNoiseLine("--------------------")).toBe(true);
    expect(isOcrNoiseLine("| | | | |")).toBe(true);
  });

  it("rejects low-alphanumeric-ratio OCR garbage", () => {
    expect(isOcrNoiseLine("l . l . l . l . l .")).toBe(true);
  });

  it("rejects all-caps institution headers", () => {
    expect(isOcrNoiseLine("COMUNE DI GERACE")).toBe(true);
    expect(isOcrNoiseLine("PROVINCIA DI REGGIO CALABRIA")).toBe(true);
  });

  it("accepts meaningful subject lines", () => {
    expect(isOcrNoiseLine("Avviso di avvio del procedimento SUAP")).toBe(false);
    expect(isOcrNoiseLine("Determina di approvazione del progetto")).toBe(false);
  });
});

describe("extractHeaderFields subject selection", () => {
  it("skips Gerace-style OCR noise and picks the first meaningful subject line", () => {
    const fields = extractHeaderFields("documento_avviso_suap", [
      "COMUNE DI GERACE",
      "--------------------",
      "l . l . l . l . l .",
      "Avviso di avvio del procedimento SUAP per autorizzazione commerciale",
    ]);

    expect(fields.subject).toBe(
      "Avviso di avvio del procedimento SUAP per autorizzazione commerciale",
    );
  });
});
