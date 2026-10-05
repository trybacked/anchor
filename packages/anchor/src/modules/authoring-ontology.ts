import type { AuthoringCommand, SemanticModel } from "@trybacked/core";
import type { TenantApiContext } from "../scope.js";
import type { Transport } from "../transport.js";
type DraftResponse = {
  revision: number;
  model: SemanticModel;
  basedOnVersion: number | null;
  updatedBy: string | null;
  updatedAt: string;
};
type ApplyResponse = {
  revision: number;
  model: SemanticModel;
  validation: {
    valid: boolean;
    issues: {
      code: string;
      severity: string;
      message: string;
    }[];
  };
};
type PublishResponse = {
  jobId: string;
};
export function createAuthoringOntologyModule(transport: Transport, ctx: TenantApiContext) {
  const base = () => ctx.url("/v1/authoring/ontology");
  const headers = (revision?: number) => {
    const h = ctx.headers;
    if (revision !== undefined) {
      return { ...h, "If-Match": `"${String(revision)}"` };
    }
    return h;
  };
  return {
    getDraft: () =>
      transport.requestJson<DraftResponse>("GET", base() + "/draft", { headers: headers() }),
    apply: (
      body: {
        commands: AuthoringCommand[];
      },
      options: {
        revision: number;
      },
    ) =>
      transport.requestJson<ApplyResponse>("POST", base() + "/draft/commands", {
        body,
        headers: headers(options.revision),
      }),
    validate: () =>
      transport.requestJson<{
        valid: boolean;
        issues: ApplyResponse["validation"]["issues"];
      }>("GET", base() + "/draft/validate", { headers: headers() }),
    diff: (against = "published") =>
      transport.requestJson<{
        changes: {
          kind: string;
          subject: string;
          detail: string;
        }[];
      }>("GET", `${base()}/draft/diff?against=${encodeURIComponent(against)}`, {
        headers: headers(),
      }),
    reset: () =>
      transport.requestJson<DraftResponse>("POST", base() + "/draft/reset", { headers: headers() }),
    publish: (
      body: {
        notes?: string;
      } = {},
    ) =>
      transport.requestJson<PublishResponse>("POST", base() + "/publish", {
        body,
        headers: headers(),
      }),
    versions: () =>
      transport.requestJson<{
        versions: {
          version: number;
          publishedAt: string;
        }[];
      }>("GET", base() + "/versions", { headers: headers() }),
    version: (v: number) =>
      transport.requestJson<{
        version: number;
        model: DraftResponse["model"];
      }>("GET", `${base()}/versions/${String(v)}`, { headers: headers() }),
    rollback: (v: number) =>
      transport.requestJson<PublishResponse>("POST", `${base()}/versions/${String(v)}/rollback`, {
        headers: headers(),
      }),
    import: (body: { format: "yaml" | "json"; content: string }) =>
      transport.requestJson<{
        revision: number;
        model: DraftResponse["model"];
      }>("POST", base() + "/import", { body, headers: headers() }),
    export: (format: "yaml" | "json" = "json") =>
      format === "json"
        ? transport.requestJson<DraftResponse["model"]>("GET", `${base()}/export?format=json`, {
            headers: headers(),
          })
        : transport.requestText("GET", `${base()}/export?format=yaml`, { headers: headers() }),
    packs: () =>
      transport.requestJson<{
        packs: {
          id: string;
          name: string;
          description: string;
        }[];
      }>("GET", base() + "/packs", { headers: headers() }),
    applyPack: (
      packId: string,
      options: {
        revision: number;
        catalog?: string;
      },
    ) =>
      transport.requestJson<ApplyResponse>(
        "POST",
        `${base()}/draft/packs/${encodeURIComponent(packId)}`,
        {
          headers: headers(options.revision),
          body: options.catalog !== undefined ? { catalog: options.catalog } : undefined,
        },
      ),
    changes: (limit = 50) =>
      transport.requestJson<{
        changes: unknown[];
      }>("GET", `${base()}/changes?limit=${String(limit)}`, { headers: headers() }),
  };
}
