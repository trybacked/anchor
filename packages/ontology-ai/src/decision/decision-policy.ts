import { z } from "zod";
import { RiskTagSchema, RISK_TAGS } from "./question-catalog.js";

/** Thresholds used when Sage is configured (`SAGE_API_KEY`). No separate on/off flag. */
export const DecisionPolicySchema = z.object({
  acceptThreshold: z.number().min(0).max(1).default(0.9),
  rejectThreshold: z.number().min(0).max(1).default(0.8),
  blockingTags: z.array(RiskTagSchema).default([...RISK_TAGS]),
});
export type DecisionPolicy = z.infer<typeof DecisionPolicySchema>;

export const DEFAULT_DECISION_POLICY: DecisionPolicy = DecisionPolicySchema.parse({});

export function readDecisionPolicyFromEnv(env: NodeJS.ProcessEnv): DecisionPolicy {
  const acceptRaw = env["ANCHOR_DECISION_ACCEPT_THRESHOLD"]?.trim();
  const rejectRaw = env["ANCHOR_DECISION_REJECT_THRESHOLD"]?.trim();
  return DecisionPolicySchema.parse({
    ...(acceptRaw !== undefined && acceptRaw.length > 0
      ? { acceptThreshold: Number(acceptRaw) }
      : {}),
    ...(rejectRaw !== undefined && rejectRaw.length > 0
      ? { rejectThreshold: Number(rejectRaw) }
      : {}),
  });
}
