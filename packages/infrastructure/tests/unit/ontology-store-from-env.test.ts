import { describe, expect, it } from "vitest";
import {
  createOntologyStoreFromEnv,
  resolveOntologyRegistryStorage,
} from "../../src/ontology-store-from-env.js";

describe("resolveOntologyRegistryStorage", () => {
  it("defaults to filesystem", () => {
    expect(resolveOntologyRegistryStorage({})).toBe("filesystem");
  });

  it("honors explicit s3", () => {
    expect(
      resolveOntologyRegistryStorage({ BACKED_ONTOLOGY_REGISTRY_STORAGE: "s3" }),
    ).toBe("s3");
  });
});

describe("createOntologyStoreFromEnv", () => {
  it("requires bucket when storage is s3", () => {
    expect(() =>
      createOntologyStoreFromEnv({ BACKED_ONTOLOGY_REGISTRY_STORAGE: "s3" }),
    ).toThrow(/BACKED_S3_BUCKET/);
  });
});
