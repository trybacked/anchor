import type { TenantApiContext } from "../scope.js";
import type { Transport } from "../transport.js";

export function createAuthoringDatasetsModule(transport: Transport, ctx: TenantApiContext) {
  const headers = () => ctx.headers;
  return {
    list: () =>
      transport.requestJson<{ datasets: unknown[] }>("GET", ctx.url("/v1/authoring/datasets"), {
        headers: headers(),
      }),

    create: (body: { name: string; sql: string }) =>
      transport.requestJson<{ name: string; fqn: string; status: string }>(
        "POST",
        ctx.url("/v1/authoring/datasets"),
        { body, headers: headers() },
      ),
  };
}
