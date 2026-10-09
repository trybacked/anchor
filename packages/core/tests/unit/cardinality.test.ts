import { describe, expect, it } from "vitest";
import {
  CardinalitySchema,
  ONTOLOGY_RELATIONSHIP_CARDINALITIES,
  OntologyRelationshipCardinalitySchema,
  parseRelationshipCardinality,
} from "../../src/cardinality.js";

describe("relationship cardinality", () => {
  it("uses one shared schema for ontology and semantic model", () => {
    expect(CardinalitySchema).toBe(OntologyRelationshipCardinalitySchema);
    expect(ONTOLOGY_RELATIONSHIP_CARDINALITIES).toEqual([
      "one_to_one",
      "one_to_many",
      "many_to_one",
      "many_to_many",
    ]);
  });

  it("preserves many_to_one when mapping from discovery", () => {
    expect(parseRelationshipCardinality("many_to_one")).toBe("many_to_one");
  });

  it("falls back for unknown values", () => {
    expect(parseRelationshipCardinality("invalid")).toBe("one_to_many");
  });
});
