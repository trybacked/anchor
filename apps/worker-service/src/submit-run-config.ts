import { TenantPipelineConfigPatchSchema, type TenantPipelineConfigPatch } from "@backed/runner";

export class InvalidSubmitRunConfigError extends Error {
  constructor() {
    super("Invalid pipeline config payload");
    this.name = "InvalidSubmitRunConfigError";
  }
}

export function parseSubmitRunConfig(
  fields: Record<string, string>,
): TenantPipelineConfigPatch | undefined {
  const raw = fields["config"];
  if (raw === undefined || raw.trim().length === 0) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new InvalidSubmitRunConfigError();
  }

  const result = TenantPipelineConfigPatchSchema.safeParse(parsed);
  if (!result.success) {
    throw new InvalidSubmitRunConfigError();
  }

  return result.data;
}
