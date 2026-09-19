import { describe, expect, it } from "vitest";
import { chunkBySize, sumBurstResults } from "../../src/run-batched-burst.js";
import { EMPTY_BURST_USAGE } from "../../src/burst.js";

describe("run-batched-burst", () => {
  it("chunkBySize splits items evenly", () => {
    expect(chunkBySize([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("sumBurstResults returns empty usage for no results", () => {
    expect(sumBurstResults([])).toEqual(EMPTY_BURST_USAGE);
  });
});
