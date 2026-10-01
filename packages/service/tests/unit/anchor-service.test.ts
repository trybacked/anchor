import { readModelYaml } from "@trybacked/core";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createAnchorService } from "../../src/index.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../fixtures/pmi-minimal",
);

describe("createAnchorService", () => {
  it("lists entities from the semantic model", () => {
    const service = createAnchorService({ model: readModelYaml(fixtureRoot) });
    const entities = service.listEntities();
    expect(entities.length).toBeGreaterThan(0);
  });

  it("reports warehouse capability when runtime is missing", () => {
    const service = createAnchorService({ model: readModelYaml(fixtureRoot) });
    expect(service.capabilities().objectQuery).toBe(false);
  });

  it("returns error result for object query without runtime", async () => {
    const service = createAnchorService({ model: readModelYaml(fixtureRoot) });
    const result = await service.objectQuery({ objectId: "customer", filters: [] });
    expect(result).toMatchObject({ error: expect.stringContaining("unavailable") });
  });

  it("returns unavailable for chunk search without document readers", async () => {
    const service = createAnchorService({ model: readModelYaml(fixtureRoot) });
    const result = await service.chunkSearch({ query: "test" });
    expect(result).toMatchObject({ error: expect.stringContaining("unavailable") });
  });
});
