import type { PlatformHandlerDeps } from "../platform-api-types.js";
type HealthSnapshotOptions = {
  includeCachedTenants: boolean;
};
export async function buildPlatformHealthSnapshot(
  deps: PlatformHandlerDeps,
  options: HealthSnapshotOptions,
): Promise<Record<string, unknown>> {
  if (deps.platformRegistry !== undefined) {
    return {
      ok: true as const,
      mode: "platform" as const,
      tenants: await deps.platformRegistry.listTenantIds(),
      ...(options.includeCachedTenants
        ? { cachedTenants: deps.platformRegistry.cachedTenantIds() }
        : {}),
    };
  }
  return {
    ok: true as const,
    mode: "workspace" as const,
    capabilities: deps.getService().capabilities(),
  };
}
