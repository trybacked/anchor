import { describe, expect, it } from "vitest";
import { normalizeComparableLine } from "../../src/text-normalize.js";

describe("normalizeComparableLine", () => {
  it("normalizes whitespace, case, and digits", () => {
    expect(normalizeComparableLine("  Invoice  123  ")).toBe("invoice #");
  });
});
