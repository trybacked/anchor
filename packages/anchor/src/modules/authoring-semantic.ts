import type { TenantApiContext } from "../scope.js";
import type { Transport } from "../transport.js";

export function createAuthoringSemanticModule(transport: Transport, ctx: TenantApiContext) {
  const base = () => ctx.url("/v1/authoring/semantic");
  return {
    feedback: (body: {
      runId: string;
      rating: "up" | "down";
      correction?: string;
      promoteToExample?: boolean;
    }) =>
      transport.requestJson<{ ok: true }>("POST", `${base()}/feedback`, {
        body,
        headers: ctx.headers,
      }),

    promoteExample: (body: { exampleId: string; question: string; tags?: string[] }) =>
      transport.requestJson<{ ok: true; exampleId: string }>("POST", `${base()}/promote-example`, {
        body,
        headers: ctx.headers,
      }),
  };
}
