import { z } from "zod";

export const SageReasoningModeSchema = z.enum(["off", "auto", "on"]);
export type SageReasoningMode = z.infer<typeof SageReasoningModeSchema>;

export const SageConfigSchema = z.object({
  apiKey: z.string().min(1),
  baseUrl: z.string().url().default("https://sage.levanto.ai"),
  timeoutMs: z.number().int().positive().default(45_000),
  reasoning: SageReasoningModeSchema.default("auto"),
});
export type SageConfig = z.infer<typeof SageConfigSchema>;

export function readSageConfigFromEnv(env: NodeJS.ProcessEnv): SageConfig | undefined {
  const apiKey = env["SAGE_API_KEY"]?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    return undefined;
  }
  const baseUrl = env["SAGE_BASE_URL"]?.trim();
  const timeoutRaw = env["SAGE_TIMEOUT_MS"]?.trim();
  const reasoningRaw = env["SAGE_REASONING"]?.trim();
  const reasoningParsed = SageReasoningModeSchema.safeParse(reasoningRaw);
  return SageConfigSchema.parse({
    apiKey,
    ...(baseUrl !== undefined && baseUrl.length > 0 ? { baseUrl } : {}),
    ...(timeoutRaw !== undefined && timeoutRaw.length > 0 ? { timeoutMs: Number(timeoutRaw) } : {}),
    ...(reasoningParsed.success ? { reasoning: reasoningParsed.data } : {}),
  });
}
