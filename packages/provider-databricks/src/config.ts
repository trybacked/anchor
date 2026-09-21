import { z } from "zod";

export const DatabricksProviderConfigSchema = z.object({
  host: z.string().min(1),
  token: z.string().min(1),
  warehouseId: z.string().min(1),
  catalog: z.string().min(1).optional(),
  schema: z.string().min(1).optional(),
});

export type DatabricksProviderConfig = z.infer<typeof DatabricksProviderConfigSchema>;

function normalizeHost(host: string): string {
  return host.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

export function databricksConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): DatabricksProviderConfig {
  return DatabricksProviderConfigSchema.parse({
    host: normalizeHost(requiredEnv(env, "BACKED_DATABRICKS_HOST")),
    token: requiredEnv(env, "BACKED_DATABRICKS_TOKEN"),
    warehouseId: requiredEnv(env, "BACKED_DATABRICKS_WAREHOUSE_ID"),
    ...(optionalEnv(env, "BACKED_DATABRICKS_CATALOG") !== undefined
      ? { catalog: optionalEnv(env, "BACKED_DATABRICKS_CATALOG") }
      : {}),
    ...(optionalEnv(env, "BACKED_DATABRICKS_SCHEMA") !== undefined
      ? { schema: optionalEnv(env, "BACKED_DATABRICKS_SCHEMA") }
      : {}),
  });
}

export function hasDatabricksEnv(env: Record<string, string | undefined> = process.env): boolean {
  return (
    env["BACKED_DATABRICKS_HOST"] !== undefined &&
    env["BACKED_DATABRICKS_HOST"].length > 0 &&
    env["BACKED_DATABRICKS_TOKEN"] !== undefined &&
    env["BACKED_DATABRICKS_TOKEN"].length > 0 &&
    env["BACKED_DATABRICKS_WAREHOUSE_ID"] !== undefined &&
    env["BACKED_DATABRICKS_WAREHOUSE_ID"].length > 0
  );
}

function requiredEnv(env: Record<string, string | undefined>, key: string): string {
  const value = env[key]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(env: Record<string, string | undefined>, key: string): string | undefined {
  const value = env[key]?.trim();
  return value !== undefined && value.length > 0 ? value : undefined;
}
