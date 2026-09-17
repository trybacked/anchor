import { describe, expect, it } from "vitest";
import { parseLocalizedNumber } from "../../src/numbers.js";

describe("parseLocalizedNumber", () => {
  it("parses decimal comma format", () => {
    expect(parseLocalizedNumber("1.234,56", "decimal_comma")).toBe(1234.56);
  });

  it("parses decimal point format", () => {
    expect(parseLocalizedNumber("1,234.56", "decimal_point")).toBe(1234.56);
  });

  it("returns null for empty or invalid input", () => {
    expect(parseLocalizedNumber("", "decimal_point")).toBeNull();
    expect(parseLocalizedNumber("not-a-number", "decimal_point")).toBeNull();
  });
});
