import { describe, expect, it } from "vitest";
import {
  keywordOrderByClause,
  keywordScoreExpression,
  splitQueryTerms,
} from "../../src/readers/keyword-score.js";

describe("splitQueryTerms", () => {
  it("lowercases, strips accents and dedupes terms", () => {
    expect(splitQueryTerms("Importi Lotti importo APPALTI!")).toEqual([
      "importi",
      "lotti",
      "importo",
      "appalti",
    ]);
  });

  it("splits tokens keeping short function words and bounds the term count", () => {
    expect(splitQueryTerms("a di è la gestione")).toEqual(["di", "la", "gestione"]);
    expect(splitQueryTerms("t1 t2 t3 t4 t5 t6 t7 t8 t9 t10 t11 t12 t13 t14")).toHaveLength(12);
  });
});

describe("keywordScoreExpression", () => {
  it("builds one named parameter per term", () => {
    const scored = keywordScoreExpression("content", ["importo", "lotti"]);
    expect(scored.parameters).toEqual([
      { name: "term0", value: "importo" },
      { name: "term1", value: "lotti" },
    ]);
    expect(scored.expression).toContain(":term0");
    expect(scored.expression).toContain(":term1");
    expect(scored.expression).toContain("REPLACE(LOWER(content)");
  });

  it("degenerates to a constant zero with no terms", () => {
    const scored = keywordScoreExpression("content", []);
    expect(scored.expression).toBe("0");
    expect(scored.parameters).toEqual([]);
  });
});

describe("keywordOrderByClause", () => {
  it("ranks by score descending and breaks ties by shorter content", () => {
    expect(keywordOrderByClause("keyword_score", "content")).toBe(
      "ORDER BY keyword_score DESC, LENGTH(content) ASC",
    );
  });
});
