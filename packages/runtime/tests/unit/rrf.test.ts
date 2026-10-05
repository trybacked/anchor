import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "../../src/readers/rrf.js";
describe("reciprocalRankFusion", () => {
  it("merges two ranked lists by id", () => {
    const merged = reciprocalRankFusion(
      [
        [
          { id: "a", row: { text: "alpha" } },
          { id: "b", row: { text: "beta" } },
        ],
        [
          { id: "b", row: { text: "beta" } },
          { id: "c", row: { text: "gamma" } },
        ],
      ],
      2,
    );
    expect(merged).toHaveLength(2);
    expect(merged[0]?.["text"]).toBe("beta");
    expect(typeof merged[0]?.["score"]).toBe("number");
  });
});
