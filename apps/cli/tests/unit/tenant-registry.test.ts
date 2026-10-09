import { describe, expect, it } from "vitest";
import {
  ensureTenantInRegistry,
  resolveTenantCatalog,
  validateTenantId,
} from "../../src/tenant/registry.js";
describe("tenant registry helpers", () => {
  it("validates tenant ids", () => {
    expect(() => validateTenantId("gerace")).not.toThrow();
    expect(() => validateTenantId("Gerace")).toThrow();
  });
  it("resolves catalog names", () => {
    expect(resolveTenantCatalog("backed")).toBe("backed");
    expect(resolveTenantCatalog("gerace")).toBe("backed_gerace");
  });
  it("adds tenant entry", () => {
    const registry = ensureTenantInRegistry(
      {
        enrollment: {
          storage: {
            provider: "s3",
            bucket: "backed-example-bucket",
            region: "eu-central-1",
          },
        },
        shared_spaces: {},
        tenants: {},
      },
      "comune_x",
      [],
      resolveTenantCatalog("comune_x"),
    );
    expect(registry.tenants["comune_x"]).toEqual({
      catalog: "backed_comune_x",
      mcp: "backed-comune_x",
      shared: [],
    });
  });
});
