import { chunkParsedDocument } from "../../src/chunk.js";
import { describe, expect, it } from "vitest";

describe("chunkParsedDocument", () => {
  it("splits long documents into bounded chunks", () => {
    const blocks = Array.from({ length: 5 }, (_, index) => {
      const text = "word ".repeat(300);
      const charStart = index * 2000;
      return {
        kind: "paragraph" as const,
        text,
        charStart,
        charEnd: charStart + text.length,
      };
    });
    const document = {
      uri: "sample.txt",
      mimeType: "text/plain",
      blocks,
      tables: [],
      plainText: blocks.map((block) => block.text).join("\n"),
    };
    const chunks = chunkParsedDocument(document, { maxChars: 1000 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.documentUri).toBe("sample.txt");
  });
});
