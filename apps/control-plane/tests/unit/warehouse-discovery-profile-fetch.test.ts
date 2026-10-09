import { describe, expect, it, vi } from "vitest";
import { fetchWarehouseDiscoveryProfileFromPlatform } from "../../src/authoring/warehouse-discovery-profile-fetch.js";

describe("fetchWarehouseDiscoveryProfileFromPlatform", () => {
  it("calls platform-api /v1 path with X-Backed-Tenant on internal base URL", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ profile: [], samples: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchWarehouseDiscoveryProfileFromPlatform({
      baseUrl: "http://platform-api.railway.internal:8080",
      tenantId: "leonardo",
      bearerToken: "service-token",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://platform-api.railway.internal:8080/v1/discovery/warehouse-profile");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer service-token");
    expect(headers["X-Backed-Tenant"]).toBe("leonardo");
    vi.unstubAllGlobals();
  });

  it("returns undefined on network failure instead of throwing", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchWarehouseDiscoveryProfileFromPlatform({
      baseUrl: "http://platform-api.railway.internal:8080",
      tenantId: "leonardo",
      bearerToken: "service-token",
    });
    expect(result).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("uses gateway /t/{tenant} path on public api host", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ profile: [], samples: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchWarehouseDiscoveryProfileFromPlatform({
      baseUrl: "https://api.backed.app",
      tenantId: "leonardo",
      bearerToken: "service-token",
    });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.backed.app/t/leonardo/v1/discovery/warehouse-profile");
    vi.unstubAllGlobals();
  });
});
