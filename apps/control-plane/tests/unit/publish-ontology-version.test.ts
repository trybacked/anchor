import type { OntologyStore, RemotePublication } from "@trybacked/registry";
import type pg from "pg";
import { describe, expect, it } from "vitest";
import { nextPublicationVersion } from "../../src/jobs/publish-ontology.js";

function poolWithLatestVersion(version: number | null): pg.Pool {
  return { query: async () => ({ rows: [{ version }] }) } as unknown as pg.Pool;
}

function storeWithCurrent(version: number | null): OntologyStore {
  return {
    loadCurrent: async () =>
      version === null ? null : ({ version } as unknown as RemotePublication),
    publish: async () => undefined,
  };
}

const input = { tenantId: "gerace", catalog: "backed_gerace" };

describe("nextPublicationVersion", () => {
  it("advances past a Volume publication the database never mirrored", async () => {
    await expect(
      nextPublicationVersion(poolWithLatestVersion(null), storeWithCurrent(1), input),
    ).resolves.toBe(2);
  });

  it("advances past the database when the Volume lags", async () => {
    await expect(
      nextPublicationVersion(poolWithLatestVersion(3), storeWithCurrent(2), input),
    ).resolves.toBe(4);
  });

  it("starts at 1 for a never-published tenant", async () => {
    await expect(
      nextPublicationVersion(poolWithLatestVersion(null), storeWithCurrent(null), input),
    ).resolves.toBe(1);
  });
});
