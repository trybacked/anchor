import type { SemanticAskResponse } from "@trybacked/service";
import type { TenantApiContext } from "../scope.js";
import type { Transport } from "../transport.js";

export function createAiModule(transport: Transport, ctx: TenantApiContext) {
  return {
    ask: (body: { question: string; evidence?: boolean | undefined }) =>
      transport.requestJson<SemanticAskResponse>("POST", ctx.url("/v1/chat/ask"), {
        body,
        headers: ctx.headers,
      }),
  };
}
