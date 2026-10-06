import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { documentIdFromVolumePath } from "../../src/document-id.js";

describe("documentIdFromVolumePath", () => {
  const volumePath = "/Volumes/backed_gerace/docs/raw/contratti/file.pdf";

  it("matches legacy hash of full volume path", () => {
    const legacy = createHash("sha256").update(volumePath, "utf8").digest("hex");
    expect(documentIdFromVolumePath(volumePath)).toBe(legacy);
  });

  it("matches hash when bronze stores dbfs prefix", () => {
    const dbfsPath = `dbfs:${volumePath}`;
    expect(documentIdFromVolumePath(dbfsPath)).toBe(documentIdFromVolumePath(volumePath));
  });
});
