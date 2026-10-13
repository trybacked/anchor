import type { AuthoringCommandV2 } from "@trybacked/core";
import type { ChangeDecision, ChangeVerdict } from "@trybacked/ontology-ai";
import type { Ui } from "../ui/format.js";
import { describeCommandTarget } from "./describe-command.js";

export type ReviewedChange = {
  command: AuthoringCommandV2;
  decision: ChangeDecision;
};

function verdictBadge(ui: Ui, verdict: ChangeVerdict): string {
  switch (verdict) {
    case "auto_approve":
      return ui.success("✓ approve");
    case "human_review":
      return ui.warn("? review ");
    case "recommend_reject":
      return ui.error("✗ reject ");
    default: {
      const _exhaustive: never = verdict;
      throw new Error(`Unhandled verdict: ${String(_exhaustive)}`);
    }
  }
}

function advisorSummary(decision: ChangeDecision): string {
  const reasons = decision.reasons.join(", ");
  if (decision.advisor === undefined) {
    return reasons;
  }
  const flagged = Object.entries(decision.advisor.risks)
    .filter(([, risk]) => risk.applies === true)
    .map(([tag]) => tag);
  const probability = `P(accept) ${decision.advisor.accept.probability.toFixed(2)}`;
  return [probability, ...flagged, reasons].filter((part) => part.length > 0).join(" · ");
}

export function renderReviewReport(
  ui: Ui,
  reviewed: readonly ReviewedChange[],
  advisorLabel: string,
): void {
  ui.log(`${ui.label("Reviewer:")} ${ui.accent(advisorLabel)}`);
  ui.blank();
  const typeWidth = Math.max(...reviewed.map(({ command }) => command.type.length));
  const targetWidth = Math.max(
    ...reviewed.map(({ command }) => describeCommandTarget(command).length),
  );
  for (const { command, decision } of reviewed) {
    ui.log(
      `  ${verdictBadge(ui, decision.verdict)}  ${ui.command(command.type.padEnd(typeWidth))}  ${describeCommandTarget(command).padEnd(targetWidth)}  ${ui.dim(advisorSummary(decision))}`,
    );
  }
  ui.blank();
}
