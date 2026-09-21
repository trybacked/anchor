import { z } from "zod";
import type { ElementStatus } from "../model.js";

export const OntologyLifecycleStageSchema = z.enum([
  "discovered",
  "proposed",
  "reviewed",
  "confirmed",
  "published",
]);

export type OntologyLifecycleStage = z.infer<typeof OntologyLifecycleStageSchema>;

const LIFECYCLE_ORDER: OntologyLifecycleStage[] = [
  "discovered",
  "proposed",
  "reviewed",
  "confirmed",
  "published",
];

export function lifecycleStageIndex(stage: OntologyLifecycleStage): number {
  return LIFECYCLE_ORDER.indexOf(stage);
}

/** Returns true when `next` is the same stage or a later stage in the governance pipeline. */
export function canAdvanceLifecycle(
  current: OntologyLifecycleStage,
  next: OntologyLifecycleStage,
): boolean {
  return lifecycleStageIndex(next) >= lifecycleStageIndex(current);
}

export function lifecycleFromModelStatus(status: ElementStatus): OntologyLifecycleStage {
  switch (status) {
    case "proposed":
      return "proposed";
    case "confirmed":
      return "confirmed";
    case "renamed":
      return "confirmed";
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled model element status: ${String(_exhaustive)}`);
    }
  }
}

export function isGovernedLifecycleStage(stage: OntologyLifecycleStage): boolean {
  return stage === "confirmed" || stage === "published";
}
