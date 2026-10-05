import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readModelYaml } from "@trybacked/core";
import type { DatabricksProviderConfig } from "@trybacked/provider-databricks";
import {
  createVolumeOntologyStore,
  publishSemanticModel,
  type BlobStore,
} from "@trybacked/registry";
import { createAnchorService } from "@trybacked/service";
import { describe, expect, it, vi } from "vitest";
vi.mock("../../src/service-factory.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/service-factory.js")>();
  const { readModelYaml } = await import("@trybacked/core");
  const fixture = join(dirname(fileURLToPath(import.meta.url)), "../../../../fixtures/pmi-minimal");
  const model = readModelYaml(fixture);
  return {
    ...actual,
    createAnchorServiceForModel: vi.fn(async () => createAnchorService({ model })),
  };
});
import {
  createTenantRuntimeRegistry,
  OntologyNotPublishedError,
  TenantNotFoundError,
} from "../../src/tenant-runtime-registry.js";
function memoryBlobStore(): BlobStore & {
  files: Map<string, string>;
} {
  const files = new Map<string, string>();
  return {
    files,
    read: async (path) => files.get(path) ?? null,
    write: async (path, text) => {
      files.set(path, text);
    },
  };
}
const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../fixtures/pmi-minimal",
);
const databricksStub: DatabricksProviderConfig = {
  host: "example.cloud.databricks.com",
  token: "token",
  warehouseId: "wh",
};
function writeRegistry(
  dir: string,
  tenants: Record<
    string,
    {
      catalog: string;
    }
  >,
): string {
  const path = join(dir, "tenants.yaml");
  const lines = [
    "enrollment:",
    "  host: https://example.cloud.databricks.com",
    "  profile: DEFAULT",
    "  warehouse_id: wh",
    "shared_spaces: {}",
    "tenants:",
  ];
  for (const [id, entry] of Object.entries(tenants)) {
    lines.push(`  ${id}:`);
    lines.push(`    catalog: ${entry.catalog}`);
    lines.push(`    mcp: backed-${id}`);
    lines.push("    shared: []");
  }
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
  return path;
}
describe("tenant runtime registry", () => {
  it("resolves tenant and caches until TTL", async () => {
    const dir = mkdtempSync(join(tmpdir(), "trr-"));
    const registryPath = writeRegistry(dir, { demo: { catalog: "backed_demo" } });
    const blobs = memoryBlobStore();
    const store = createVolumeOntologyStore(blobs);
    const model = readModelYaml(fixtureRoot);
    const record = publishSemanticModel(fixtureRoot, model, { ontologyId: "demo" });
    const modelYaml = readFileSync(join(fixtureRoot, "model.yaml"), "utf8");
    await store.publish("backed_demo", record, modelYaml);
    let builds = 0;
    const registry = createTenantRuntimeRegistry({
      registryPath,
      databricksConfig: databricksStub,
      env: {},
      ontologyStore: {
        loadCurrent: async (catalog) => {
          builds += 1;
          return store.loadCurrent(catalog);
        },
        publish: store.publish,
      },
      cacheTtlSeconds: 60,
    });
    const a = await registry.resolve("demo");
    const b = await registry.resolve("demo");
    expect(a).toBe(b);
    expect(builds).toBe(1);
    expect(registry.cachedTenantIds()).toEqual(["demo"]);
  });
  it("throws for unknown tenant and missing publication", async () => {
    const dir = mkdtempSync(join(tmpdir(), "trr-"));
    const registryPath = writeRegistry(dir, { demo: { catalog: "backed_demo" } });
    const store = createVolumeOntologyStore(memoryBlobStore());
    const registry = createTenantRuntimeRegistry({
      registryPath,
      databricksConfig: databricksStub,
      env: {},
      ontologyStore: store,
      cacheTtlSeconds: 1,
    });
    await expect(registry.resolve("missing")).rejects.toBeInstanceOf(TenantNotFoundError);
    await expect(registry.resolve("demo")).rejects.toBeInstanceOf(OntologyNotPublishedError);
  });
});
