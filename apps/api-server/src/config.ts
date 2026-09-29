import { z } from "zod";

const ApiConfigSchema = z.object({
  port: z.number().int().positive(),
  workspaceRoot: z.string().optional(),
  apiToken: z.string().min(1),
  auditPrincipalId: z.string().min(1),
});

export type ApiConfig = z.infer<typeof ApiConfigSchema>;

export function readApiConfig(env: NodeJS.ProcessEnv): ApiConfig {
  const token = env["ANCHOR_API_TOKEN"];
  if (token === undefined || token.trim().length === 0) {
    throw new Error("ANCHOR_API_TOKEN is required to start the Anchor API server.");
  }
  const port = Number(env["ANCHOR_API_PORT"] ?? 8787);
  const workspaceRoot = env["ANCHOR_WORKSPACE_ROOT"];
  const auditPrincipalId = token.slice(0, 8);
  return ApiConfigSchema.parse({
    port,
    workspaceRoot,
    apiToken: token,
    auditPrincipalId,
  });
}
