import type { TenantApiContext } from "../scope.js";
import type { Transport } from "../transport.js";

export function createAuthoringWarehouseModule(transport: Transport, ctx: TenantApiContext) {
  const headers = () => ctx.headers;
  return {
    schemas: () =>
      transport.requestJson<{ schemas: string[] }>(
        "GET",
        ctx.url("/v1/authoring/warehouse/schemas"),
        {
          headers: headers(),
        },
      ),

    tables: (schema: string) =>
      transport.requestJson<{
        tables: { fqn: string; name: string; schema: string; catalog: string }[];
      }>("GET", ctx.url(`/v1/authoring/warehouse/tables?schema=${encodeURIComponent(schema)}`), {
        headers: headers(),
      }),

    columns: (fqn: string) =>
      transport.requestJson<{ columns: { name: string; dataType: string; nullable: boolean }[] }>(
        "GET",
        ctx.url(`/v1/authoring/warehouse/tables/${encodeURIComponent(fqn)}/columns`),
        { headers: headers() },
      ),
  };
}
