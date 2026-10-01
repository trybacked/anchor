import type { TenantsRegistry } from "@trybacked/core";
import type { ControlPlaneConfig } from "./config.js";
import { buildEnrollmentRegistry } from "./config.js";
import type { OrganizationRow } from "./db/repositories.js";

export function buildTenantsRegistry(
  config: ControlPlaneConfig,
  organizations: OrganizationRow[],
): TenantsRegistry {
  const base = buildEnrollmentRegistry(config);
  const tenants: TenantsRegistry["tenants"] = {};
  for (const org of organizations) {
    if (org.status !== "active") {
      continue;
    }
    const shared = parseSharedSpaces(org.shared_spaces);
    tenants[org.tenant_id] = {
      catalog: org.catalog,
      mcp: org.mcp_name,
      shared,
    };
  }
  return {
    enrollment: base.enrollment,
    shared_spaces: base.shared_spaces,
    tenants,
  };
}

function parseSharedSpaces(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((entry): entry is string => typeof entry === "string");
      }
    } catch {
      return [];
    }
  }
  return [];
}
