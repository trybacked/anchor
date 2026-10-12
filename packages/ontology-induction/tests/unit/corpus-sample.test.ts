import { describe, expect, it } from "vitest";
import { sampleCorpusExcerpts } from "../../src/corpus-sample.js";

describe("sampleCorpusExcerpts", () => {
  it("round-robins collections and caps size (lost-in-the-middle guard)", () => {
    const sampled = sampleCorpusExcerpts(
      [
        { uri: "a", excerpt: "x".repeat(3000), collection: "c1" },
        { uri: "b", excerpt: "y", collection: "c2" },
        { uri: "c", excerpt: "z", collection: "c1" },
      ],
      { maxDocuments: 2, maxCharsPerDoc: 100 },
    );
    expect(sampled).toHaveLength(2);
    expect(sampled[0]?.collection).toBe("c1");
    expect(sampled[1]?.collection).toBe("c2");
    expect(sampled[0]?.excerpt.length).toBeLessThanOrEqual(100);
  });
});
