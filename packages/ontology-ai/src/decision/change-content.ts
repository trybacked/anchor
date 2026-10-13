import type { OntologyV2 } from "@trybacked/core";
import type { ProposedChange } from "../proposal.js";

/** Conservative per-group budget (Sage ~32K tokens; stay well under). */
export const CHANGE_CONTENT_CHAR_BUDGET = 24_000;

export function buildChangeContent(
  change: ProposedChange,
  baselineOntology: OntologyV2,
): { content: string; withinBudget: boolean } {
  const objectTypeIds = baselineOntology.objectTypes.map((object) => object.id);
  const linkTypeIds = baselineOntology.linkTypes.map((link) => link.id);
  const sections = [
    "## Proposed change",
    JSON.stringify(
      {
        id: change.id,
        confidence: change.confidence,
        rationale: change.rationale,
        evidence: change.evidence,
        command: change.command,
      },
      null,
      2,
    ),
    "## Current ontology snapshot",
    JSON.stringify(
      {
        objectTypeIds,
        linkTypeIds,
        objectTypeCount: baselineOntology.objectTypes.length,
        linkTypeCount: baselineOntology.linkTypes.length,
      },
      null,
      2,
    ),
  ];
  const content = sections.join("\n\n");
  return { content, withinBudget: content.length <= CHANGE_CONTENT_CHAR_BUDGET };
}
