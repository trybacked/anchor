import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFileRegistrySource,
  createHttpRegistrySource,
  createRegistrySourceFromEnv,
  resolveRegistrySourceFromEnv,
} from "../../src/tenant-registry-source.js";

const MINIMAL_TENANTS_YAML = `
enrollment:
  host: https://example.cloud.databricks.com
  profile: DEFAULT
  warehouse_id: wh
shared_spaces:
  anac:
    catalog: backed
    schema: anac
tenants: {}
`;

describe("tenant-registry-source", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolveRegistrySourceFromEnv defaults to file path", () => {
    expect(resolveRegistrySourceFromEnv({})).toEqual({
      mode: "file",
      filePath: "/etc/backed/tenants.yaml",
    });
  });

  it("resolveRegistrySourceFromEnv requires http url and token", () => {
    expect(() => resolveRegistrySourceFromEnv({ BACKED_REGISTRY_SOURCE: "http" })).toThrow(
      "BACKED_REGISTRY_URL",
    );
    expect(() =>
      resolveRegistrySourceFromEnv({
        BACKED_REGISTRY_SOURCE: "http",
        BACKED_REGISTRY_URL: "http://cp/v1/registry",
      }),
    ).toThrow("BACKED_REGISTRY_TOKEN");
  });

  it("createFileRegistrySource loads yaml from disk", async () => {
    const dir = mkdtempSync(join(tmpdir(), "backed-registry-"));
    const path = join(dir, "tenants.yaml");
    writeFileSync(path, MINIMAL_TENANTS_YAML, "utf8");
    const source = createFileRegistrySource(path);
    const snapshot = await source.load();
    expect(snapshot.registry.enrollment.host).toBe("https://example.cloud.databricks.com");
    expect(Number(snapshot.version)).toBeGreaterThan(0);
  });

  it("createHttpRegistrySource fetches and caches by ttl", async () => {
    vi.useFakeTimers();
    const registryJson = {
      enrollment: {
        host: "https://example.cloud.databricks.com",
        profile: "DEFAULT",
        warehouse_id: "wh",
      },
      shared_spaces: { anac: { catalog: "backed", schema: "anac" } },
      tenants: {},
    };
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      if (headers?.["If-None-Match"] === '"v1"') {
        return new Response(null, { status: 304 });
      }
      return new Response(JSON.stringify(registryJson), {
        status: 200,
        headers: { etag: '"v1"' },
      });
    });
    const source = createHttpRegistrySource({
      url: "http://cp/v1/registry",
      token: "secret",
      ttlSeconds: 60,
      fetchImpl,
    });
    const first = await source.load();
    const second = await source.load();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(first.registry).toEqual(registryJson);
    expect(second).toBe(first);

    vi.advanceTimersByTime(61_000);
    await source.load();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("createHttpRegistrySource throws on error status", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 503 }));
    const source = createHttpRegistrySource({
      url: "http://cp/v1/registry",
      token: "secret",
      fetchImpl,
    });
    await expect(source.load()).rejects.toThrow("Registry HTTP 503");
  });

  it("createRegistrySourceFromEnv wires http mode", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            enrollment: {
              host: "https://example.cloud.databricks.com",
              profile: "DEFAULT",
              warehouse_id: "wh",
            },
            shared_spaces: { anac: { catalog: "backed", schema: "anac" } },
            tenants: {},
          }),
          { status: 200 },
        ),
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as typeof fetch;
    try {
      const source = createRegistrySourceFromEnv({
        BACKED_REGISTRY_SOURCE: "http",
        BACKED_REGISTRY_URL: "http://cp/v1/registry",
        BACKED_REGISTRY_TOKEN: "t",
      });
      const snapshot = await source.load();
      expect(snapshot.registry.tenants).toEqual({});
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
