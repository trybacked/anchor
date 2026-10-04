/** Per-tenant kill switch in tenants.yaml → `capabilities.aiAsk: false` */
export type TenantAiAskCapabilities = {
  aiAsk?: boolean | undefined;
  /** @deprecated use aiAsk */
  semanticAgent?: boolean | undefined;
};

export function tenantAiAskEnabled(
  capabilities?: TenantAiAskCapabilities | undefined,
): boolean {
  if (capabilities?.aiAsk === false) {
    return false;
  }
  if (capabilities?.semanticAgent === false) {
    return false;
  }
  return true;
}
