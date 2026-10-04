import type { AnchorService } from "./anchor-service.js";
import type { ChatAskStatusResponse } from "./responses.js";

export function getChatAskStatus(service: AnchorService): ChatAskStatusResponse {
  if (service.semanticAsk === undefined) {
    return { available: false, reason: "missing_llm_gateway" };
  }
  const capabilities = service.capabilities() as Record<string, boolean | undefined>;
  if (capabilities["aiAsk"] !== true) {
    return { available: false, reason: "disabled_for_tenant" };
  }
  return { available: true };
}
