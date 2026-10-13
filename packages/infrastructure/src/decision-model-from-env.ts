import type { DecisionModel } from "@trybacked/ports";
import { createSageDecisionModel, readSageConfigFromEnv } from "./adapters/sage/index.js";

export function createDecisionModelFromEnv(env: NodeJS.ProcessEnv): DecisionModel | undefined {
  const config = readSageConfigFromEnv(env);
  if (config === undefined) {
    return undefined;
  }
  return createSageDecisionModel(config);
}
