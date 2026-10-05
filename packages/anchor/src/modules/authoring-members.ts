import type { TenantRole } from "@trybacked/core";
import type { TenantApiContext } from "../scope.js";
import type { Transport } from "../transport.js";
export function createAuthoringMembersModule(transport: Transport, ctx: TenantApiContext) {
  const headers = () => ctx.headers;
  return {
    list: () =>
      transport.requestJson<{
        members: unknown[];
      }>("GET", ctx.url("/v1/authoring/members"), {
        headers: headers(),
      }),
    set: (body: { subjectType: "user" | "workos_role"; subject: string; role: TenantRole }) =>
      transport.requestJson<{
        ok: true;
      }>("PUT", ctx.url("/v1/authoring/members"), {
        body,
        headers: headers(),
      }),
    remove: (subjectType: string, subject: string) =>
      transport.requestJson<{
        ok: true;
      }>(
        "DELETE",
        ctx.url(
          `/v1/authoring/members/${encodeURIComponent(subjectType)}/${encodeURIComponent(subject)}`,
        ),
        { headers: headers() },
      ),
  };
}
