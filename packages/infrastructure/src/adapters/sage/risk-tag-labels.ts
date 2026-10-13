/** Sage tag labels for ontology change risk signals (mirrors ontology-ai question catalog). */
const RISK_TAG_LABELS: Record<string, string> = {
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

export function sageTagLabel(tagId: string): string {
  return RISK_TAG_LABELS[tagId] ?? tagId;
}
