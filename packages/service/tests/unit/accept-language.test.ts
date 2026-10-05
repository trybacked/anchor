import { describe, expect, it } from "vitest";
import { preferredLanguage } from "../../src/accept-language.js";

describe("preferredLanguage", () => {
  it("returns the primary subtag of the highest-weighted entry", () => {
    expect(preferredLanguage("it-IT,it;q=0.9,en;q=0.8")).toBe("it");
    expect(preferredLanguage("en;q=0.5, de-CH;q=0.9")).toBe("de");
  });

  it("ignores wildcards, zero weights and malformed tags", () => {
    expect(preferredLanguage("*")).toBeUndefined();
    expect(preferredLanguage("fr;q=0, *;q=0.1")).toBeUndefined();
    expect(preferredLanguage("x1-??")).toBeUndefined();
  });

  it("is undefined without a header", () => {
    expect(preferredLanguage(undefined)).toBeUndefined();
    expect(preferredLanguage("")).toBeUndefined();
  });
});
