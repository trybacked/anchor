import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { publishSemanticModel } from "../../src/publish.js";
import type { BlobStore } from "../../src/remote-store.js";
import { createVolumeOntologyStore } from "../../src/remote-store.js";
function memoryBlobStore(): BlobStore & {
  files: Map<string, string>;
} {
  const files = new Map<string, string>();
  return {
    files,
    read: async (path) => files.get(path) ?? null,
    write: async (path, text, options) => {
      if (options?.overwrite !== true && files.has(path)) {
        throw new Error(`File already exists: ${path}`);
      }
      files.set(path, text);
    },
  };
}
const baseModel = {
  metadata: {
    formatVersion: "1" as const,
    runId: "run-1",
    generatedAt: new Date().toISOString(),
  },
  entities: [
    {
      id: "orders",
      name: "Orders",
      sourceTable: "orders",
      status: "confirmed" as const,
      confidence: 0.9,
      provenance: { table: "orders", evidence: "test" },
      properties: [
        {
          name: "Id",
          columnName: "id",
          semanticType: "identifier" as const,
          role: "primary_key" as const,
          nullable: false,
          confidence: 0.9,
          provenance: { table: "orders", column: "id", evidence: "pk" },
        },
      ],
    },
  ],
  relations: [],
  rules: [],
};
function sampleRecord(root: string) {
  return publishSemanticModel(root, baseModel, { ontologyId: "gerace" });
}
describe("createVolumeOntologyStore", () => {
  it("publish writes version file and current.json", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "remote-store-"));
    try {
      const record = sampleRecord(root);
      const blobs = memoryBlobStore();

      const store = createVolumeOntologyStore(blobs, {
        root: "/tenants",
        schema: "backed",
        volume: "registry",
      });
      await store.publish("backed_gerace", record, "entities: []\n");
      expect(blobs.files.has("/tenants/backed_gerace/backed/registry/publications/v1.json")).toBe(
        true,
      );
      expect(blobs.files.has("/tenants/backed_gerace/backed/registry/current.json")).toBe(true);
      const loaded = await store.loadCurrent("backed_gerace");
      expect(loaded?.version).toBe(1);
      expect(loaded?.modelYaml).toBe("entities: []\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("increments version paths on publish", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "remote-store-"));
    try {
      const v1 = sampleRecord(root);
      const v2 = publishSemanticModel(
        root,
        { ...baseModel, metadata: { ...baseModel.metadata, runId: "run-2" } },
        { ontologyId: "gerace" },
      );
      const blobs = memoryBlobStore();
      const store = createVolumeOntologyStore(blobs, {
        root: "/tenants",
        schema: "backed",
        volume: "registry",
      });
      await store.publish("backed", v1, "a: 1\n");
      await store.publish("backed", v2, "a: 2\n");
      const current = await store.loadCurrent("backed");
      expect(current?.version).toBe(2);
      expect(blobs.files.get("/tenants/backed/backed/registry/publications/v2.json")).toContain(
        "a: 2",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
