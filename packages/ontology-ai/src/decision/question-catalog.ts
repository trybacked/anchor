import type { DecisionQuestion } from "@trybacked/ports";
import { z } from "zod";

export const CATALOG_VERSION = "ontology-change-v1";

export const RISK_TAGS = [
  "duplicates_existing",
  "naming_inconsistent",
  "weak_evidence",
  "semantic_mismatch",
  "cardinality_doubt",
] as const;

export const RiskTagSchema = z.enum(RISK_TAGS);
export type RiskTag = z.infer<typeof RiskTagSchema>;

const RISK_TAG_DESCRIPTIONS: Record<RiskTag, string> = {
  duplicates_existing:
    "duplicates_existing: the change repeats an object type, property, or link that already exists",
  naming_inconsistent:
    "naming_inconsistent: ids or display names conflict with existing ontology naming conventions",
  weak_evidence:
    "weak_evidence: rationale or samples do not support the proposed mapping or semantics",
  semantic_mismatch:
    "semantic_mismatch: the command does not match the described column semantics or role",
  cardinality_doubt:
    "cardinality_doubt: link cardinality or key mappings look wrong for the sample data",
};

export function riskTagDescription(tag: RiskTag): string {
  return RISK_TAG_DESCRIPTIONS[tag];
}

export function questionsForChange(blockingTags: readonly RiskTag[]): readonly DecisionQuestion[] {
  return [
    {
      kind: "yesno",
      id: "accept",
      question:
        "Should this ontology change be accepted as making the model more correct and consistent with the provided evidence?",
    },
    {
      kind: "tags",
      id: "risks",
      question: "Which risk signals apply to this proposed ontology change?",
      tags: blockingTags,
    },
  ];
}
