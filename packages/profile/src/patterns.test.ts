import { describe, expect, it } from "vitest";

import {
  detectPatterns,
  matchesAmount,
  matchesDate,
  matchesEmail,
  matchesFiscalCode,
  matchesVatNumber,
} from "./patterns.js";

describe("matchesDate", () => {
  it("accepts ISO and Italian formats", () => {
    expect(matchesDate("2024-01-15")).toBe(true);
    expect(matchesDate("15/01/2024")).toBe(true);
    expect(matchesDate("5/1/2024")).toBe(true);
    expect(matchesDate("15-01-2024")).toBe(true);
  });

  it("rejects non-dates", () => {
    expect(matchesDate("2024-0001")).toBe(false);
    expect(matchesDate("gennaio 2024")).toBe(false);
    expect(matchesDate("")).toBe(false);
  });
});

describe("matchesEmail", () => {
  it("accepts plausible addresses", () => {
    expect(matchesEmail("info@arredamentiblu.it")).toBe(true);
    expect(matchesEmail("mario.rossi@pec.aziendale.it")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(matchesEmail("info@")).toBe(false);
    expect(matchesEmail("senza-chiocciola.it")).toBe(false);
    expect(matchesEmail("due parole@dominio.it")).toBe(false);
  });
});

describe("matchesVatNumber", () => {
  it("accepts 11 digits, including leading zero", () => {
    expect(matchesVatNumber("01234567890")).toBe(true);
    expect(matchesVatNumber("12345678901")).toBe(true);
  });

  it("rejects wrong length or non-digits", () => {
    expect(matchesVatNumber("1234567890")).toBe(false);
    expect(matchesVatNumber("123456789012")).toBe(false);
    expect(matchesVatNumber("IT012345678")).toBe(false);
  });
});

describe("matchesFiscalCode", () => {
  it("accepts structurally valid personal codes", () => {
    expect(matchesFiscalCode("RSSMRA80A01H501U")).toBe(true);
    expect(matchesFiscalCode("rssmra80a01h501u")).toBe(true);
  });

  it("rejects invalid structure", () => {
    expect(matchesFiscalCode("RSSMRA80Z01H501U")).toBe(false);
    expect(matchesFiscalCode("01234567890")).toBe(false);
    expect(matchesFiscalCode("RSSMRA80A01H501")).toBe(false);
  });
});

describe("matchesAmount", () => {
  it("accepts Italian and anglo decimal formats", () => {
    expect(matchesAmount("1250,00")).toBe(true);
    expect(matchesAmount("1.250,00")).toBe(true);
    expect(matchesAmount("-89,9")).toBe(true);
    expect(matchesAmount("349.90")).toBe(true);
    expect(matchesAmount("1,349.90")).toBe(true);
  });

  it("rejects plain integers and free text", () => {
    expect(matchesAmount("1250")).toBe(false);
    expect(matchesAmount("EUR 12,50")).toBe(false);
  });
});

describe("detectPatterns", () => {
  it("reports patterns above the match threshold", () => {
    const values = [
      "01234567890",
      "09876543210",
      "04567891230",
      "07891234560",
      "non una piva",
    ];
    const detected = detectPatterns(values);
    expect(detected).toEqual([{ kind: "vat_number", matchRatio: 0.8 }]);
  });

  it("omits patterns below the threshold", () => {
    expect(detectPatterns(["01234567890", "x", "y", "z"])).toEqual([]);
  });

  it("ignores blank values and returns nothing on empty input", () => {
    expect(detectPatterns([])).toEqual([]);
    expect(detectPatterns(["  ", ""])).toEqual([]);
    expect(detectPatterns(["  01234567890  ", ""])).toEqual([
      { kind: "vat_number", matchRatio: 1 },
    ]);
  });
});
