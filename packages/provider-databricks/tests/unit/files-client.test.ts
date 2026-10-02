import { describe, expect, it } from "vitest";
import { normalizeDatabricksVolumePath } from "../../src/files-client.js";

describe("normalizeDatabricksVolumePath", () => {
  it("strips dbfs: prefix", () => {
    expect(normalizeDatabricksVolumePath("dbfs:/Volumes/cat/docs/raw/a.pdf")).toBe(
      "/Volumes/cat/docs/raw/a.pdf",
    );
  });

  it("keeps /Volumes paths", () => {
    expect(normalizeDatabricksVolumePath("/Volumes/cat/docs/raw/a.pdf")).toBe(
      "/Volumes/cat/docs/raw/a.pdf",
    );
  });
});
