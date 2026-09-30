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
          host: "https://example.cloud.databricks.com",
          profile: "DEFAULT",
          warehouse_id: "wh",
        },
        shared_spaces: {
          anac: { catalog: "backed", schema: "anac" },
        },
        tenants: {},
      },
      "comune_x",
      ["anac"],
    );
    expect(registry.tenants["comune_x"]).toEqual({
      catalog: "backed_comune_x",
      mcp: "backed-comune_x",
      shared: ["anac"],
    });
  });
});
