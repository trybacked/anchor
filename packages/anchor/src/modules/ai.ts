import type {
  ChatAskStatusResponse,
  SemanticAskBody,
  SemanticAskResponse,
} from "@trybacked/service";
import type { TenantApiContext } from "../scope.js";
import type { Transport } from "../transport.js";
export function createAiModule(transport: Transport, ctx: TenantApiContext) {
  return {
    status: () =>
      transport.requestJson<ChatAskStatusResponse>("GET", ctx.url("/v1/chat/ask/status"), {
        headers: ctx.headers,
      }),
    ask: (body: SemanticAskBody) =>
      transport.requestJson<SemanticAskResponse>("POST", ctx.url("/v1/chat/ask"), {
        body,
        headers: ctx.headers,
      }),
  };
}
