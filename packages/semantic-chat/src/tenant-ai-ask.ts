export type TenantAiAskCapabilities = {
  aiAsk?: boolean | undefined;
};
export function tenantAiAskEnabled(capabilities?: TenantAiAskCapabilities): boolean {
  return capabilities?.aiAsk !== false;
}
