import type { OntologyObject } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import { compileObjectFilter, compileTextSearch, escapeLikePattern } from "../../src/filters.js";
import type { SqlParameter } from "../../src/query.js";

const contract: OntologyObject = {
  id: "contract",
  name: "Contract",
  properties: [
    { id: "oggetto_gara", name: "Subject", type: "string" },
    { id: "note", name: "Note", type: "string" },
  ],
};

describe("escapeLikePattern", () => {
  it("escapes % and _", () => {
    expect(escapeLikePattern("100%_done")).toBe("100\\%\\_done");
  });
});

describe("text matching", () => {
  it("matches long terms as case-insensitive substrings", () => {
    const parameters: SqlParameter[] = [];
    const sql = compileObjectFilter(
      contract,
      "o0",
      { propertyId: "oggetto_gara", op: "contains", value: "rifiuti" },
      parameters,
    );
    expect(sql).toBe("LOWER(`o0`.`oggetto_gara`) LIKE LOWER(:p0)");
    expect(parameters).toEqual([{ name: "p0", value: "%rifiuti%" }]);
  });

  it("matches short terms (acronyms) as whole words", () => {
    const parameters: SqlParameter[] = [];
    const sql = compileObjectFilter(
      contract,
      "o0",
      { propertyId: "oggetto_gara", op: "contains", value: "AI" },
      parameters,
    );
    expect(sql).toBe("`o0`.`oggetto_gara` RLIKE :p0");
    expect(parameters[0]?.value).toBe("(?i)(?<![\\p{L}\\p{N}])\\QAI\\E(?![\\p{L}\\p{N}])");
  });

  it("negates whole-word matches for not_contains", () => {
    const parameters: SqlParameter[] = [];
    const sql = compileObjectFilter(
      contract,
      "o0",
      { propertyId: "oggetto_gara", op: "not_contains", value: "AI" },
      parameters,
    );
    expect(sql).toBe("NOT (`o0`.`oggetto_gara` RLIKE :p0)");
  });

  it("binds one parameter for textSearch across columns", () => {
    const parameters: SqlParameter[] = [];
    const sql = compileTextSearch(contract, "o0", "AI", undefined, parameters);
    expect(sql).toBe("(`o0`.`oggetto_gara` RLIKE :p0 OR `o0`.`note` RLIKE :p0)");
    expect(parameters).toHaveLength(1);
  });
});
