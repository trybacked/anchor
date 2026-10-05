import type { AnchorService } from "./anchor-service.js";
import type { ChatAskStatusResponse, ChatAskUnavailableReason } from "./responses.js";
export type SemanticAskHandler = NonNullable<AnchorService["semanticAsk"]>;
export type ChatAskResolution =
  | {
      available: true;
      ask: SemanticAskHandler;
    }
  | {
      available: false;
      reason: ChatAskUnavailableReason;
    };
export function resolveChatAsk(service: AnchorService): ChatAskResolution {
  const ask = service.semanticAsk;
  if (ask === undefined) {
    return { available: false, reason: "missing_llm_gateway" };
  }
  const capabilities = service.capabilities() as Record<string, boolean | undefined>;
  if (capabilities["aiAsk"] !== true) {
    return { available: false, reason: "disabled_for_tenant" };
  }
  return { available: true, ask };
}
export function getChatAskStatus(service: AnchorService): ChatAskStatusResponse {
  const resolution = resolveChatAsk(service);
  return resolution.available
    ? { available: true }
    : { available: false, reason: resolution.reason };
}
