import { z } from "zod";

export const CONTROL_PLANE_DISCOVERY_TOOL_NAMES = {
  proposeDocsOntology: "propose_docs_ontology",
  proposeDocsOntologyAi: "propose_docs_ontology_ai",
  applyDocsDiscoveryReview: "apply_docs_discovery_review",
  getDocsDiscoveryRun: "get_docs_discovery_run",
} as const;

export type ControlPlaneDiscoveryClient = {
  tenantId: string;
  baseUrl: string;
  token: string;
  actor?: string;
};

async function authoringFetch(
  client: ControlPlaneDiscoveryClient,
  path: string,
  init: RequestInit & { revision?: number } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${client.token}`);
  headers.set("X-Backed-User", client.actor ?? "mcp");
  if (init.revision !== undefined) {
    headers.set("If-Match", String(init.revision));
  }
  const url = `${client.baseUrl.replace(/\/+$/, "")}/v1/tenants/${encodeURIComponent(client.tenantId)}${path}`;
  return fetch(url, { ...init, headers });
}

export type ControlPlaneDiscoveryToolContext = {
  controlPlane: ControlPlaneDiscoveryClient;
};

export const CONTROL_PLANE_DISCOVERY_TOOL_DEFINITIONS = [
  {
    name: CONTROL_PLANE_DISCOVERY_TOOL_NAMES.proposeDocsOntology,
    title: "Propose docs ontology from warehouse",
    description:
      "Profiles curated document archive tables in the warehouse and returns a discovery run with review questions.",
    inputSchema: {
      reviewConfidenceThreshold: z.number().min(0).max(1).optional(),
      tables: z.array(z.string()).optional(),
    },
    handler: async (
      context: ControlPlaneDiscoveryToolContext,
      args: { reviewConfidenceThreshold?: number; tables?: string[] },
    ) => {
      const response = await authoringFetch(
        context.controlPlane,
        "/authoring/discovery/docs/propose",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(args.reviewConfidenceThreshold !== undefined
              ? { reviewConfidenceThreshold: args.reviewConfidenceThreshold }
              : {}),
            ...(args.tables !== undefined ? { tables: args.tables } : {}),
          }),
        },
      );
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text);
      }
      return JSON.parse(text) as unknown;
    },
  },
  {
    name: CONTROL_PLANE_DISCOVERY_TOOL_NAMES.proposeDocsOntologyAi,
    title: "Propose docs ontology with AI (from files)",
    description:
      "Profiles docs tables, samples row text, and uses an LLM to refine entity names, semantics, relations, and review questions. Requires AI_GATEWAY_API_KEY on control-plane.",
    inputSchema: {
      reviewConfidenceThreshold: z.number().min(0).max(1).optional(),
      tables: z.array(z.string()).optional(),
      locale: z.string().min(2).max(8).optional(),
    },
    handler: async (
      context: ControlPlaneDiscoveryToolContext,
      args: {
        reviewConfidenceThreshold?: number;
        tables?: string[];
        locale?: string;
      },
    ) => {
      const response = await authoringFetch(
        context.controlPlane,
        "/authoring/discovery/docs/propose-ai",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(args.reviewConfidenceThreshold !== undefined
              ? { reviewConfidenceThreshold: args.reviewConfidenceThreshold }
              : {}),
            ...(args.tables !== undefined ? { tables: args.tables } : {}),
            ...(args.locale !== undefined ? { locale: args.locale } : {}),
          }),
        },
      );
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text);
      }
      return JSON.parse(text) as unknown;
    },
  },
  {
    name: CONTROL_PLANE_DISCOVERY_TOOL_NAMES.getDocsDiscoveryRun,
    title: "Get docs discovery run",
    description: "Returns stored discovery report and proposal including review questions.",
    inputSchema: {
      runId: z.string().min(1),
    },
    handler: async (context: ControlPlaneDiscoveryToolContext, args: { runId: string }) => {
      const response = await authoringFetch(
        context.controlPlane,
        `/authoring/discovery/runs/${encodeURIComponent(args.runId)}`,
      );
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text);
      }
      return JSON.parse(text) as unknown;
    },
  },
  {
    name: CONTROL_PLANE_DISCOVERY_TOOL_NAMES.applyDocsDiscoveryReview,
    title: "Apply docs discovery review",
    description:
      "Submits review answers for a discovery run. Set apply=true to merge accepted entities into the ontology draft (requires draftRevision).",
    inputSchema: {
      runId: z.string().min(1),
      answeredAt: z.string().datetime(),
      answers: z.array(
        z.object({
          questionId: z.string().min(1),
          decision: z.enum(["yes", "no", "rename"]),
          newName: z.string().optional(),
        }),
      ),
      apply: z.boolean().optional(),
      draftRevision: z.number().int().nonnegative().optional(),
      includeRelations: z.boolean().optional(),
    },
    handler: async (
      context: ControlPlaneDiscoveryToolContext,
      args: {
        runId: string;
        answeredAt: string;
        answers: {
          questionId: string;
          decision: "yes" | "no" | "rename";
          newName?: string;
        }[];
        apply?: boolean;
        draftRevision?: number;
        includeRelations?: boolean;
      },
    ) => {
      const response = await authoringFetch(
        context.controlPlane,
        `/authoring/discovery/runs/${encodeURIComponent(args.runId)}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId: args.runId,
            answeredAt: args.answeredAt,
            answers: args.answers,
            ...(args.apply !== undefined ? { apply: args.apply } : {}),
            ...(args.includeRelations !== undefined
              ? { includeRelations: args.includeRelations }
              : {}),
          }),
          ...(args.draftRevision !== undefined ? { revision: args.draftRevision } : {}),
        },
      );
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text);
      }
      return JSON.parse(text) as unknown;
    },
  },
] as const;
