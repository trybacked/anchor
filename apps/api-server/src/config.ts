import { z } from "zod";

const ApiConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive(),
  workspaceRoot: z.string().optional(),
  apiToken: z.string().min(1),
  auditPrincipalId: z.string().min(1),
  auditLogPath: z.string().min(1).optional(),
  auditLogMirrorStderr: z.boolean(),
});

export type ApiConfig = z.infer<typeof ApiConfigSchema>;

export function readApiConfig(env: NodeJS.ProcessEnv): ApiConfig {
  const token = env["ANCHOR_API_TOKEN"];
  if (token === undefined || token.trim().length === 0) {
    throw new Error("ANCHOR_API_TOKEN is required to start the Anchor API server.");
  }
  const host = env["ANCHOR_API_HOST"] ?? env["HOST"] ?? "127.0.0.1";
  const port = Number(env["ANCHOR_API_PORT"] ?? env["PORT"] ?? 8787);
  const workspaceRoot = env["ANCHOR_WORKSPACE_ROOT"];
  const auditPrincipalId = token.slice(0, 8);
  const auditLogPath = env["ANCHOR_AUDIT_LOG_PATH"]?.trim();
  const auditLogMirrorStderr = env["ANCHOR_AUDIT_LOG_STDERR"] !== "0";
  return ApiConfigSchema.parse({
    host,
    port,
    workspaceRoot,
    apiToken: token,
    auditPrincipalId,
    ...(auditLogPath !== undefined && auditLogPath.length > 0 ? { auditLogPath } : {}),
    auditLogMirrorStderr,
  });
}
