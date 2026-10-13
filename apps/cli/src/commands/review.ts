import {
  applyCommandsV2,
  parseChangeSet,
  readOntologyV2Yaml,
  writeOntologyV2Yaml,
} from "@trybacked/core";
import { createDecisionModelFromEnv } from "@trybacked/infrastructure";
import {
  decideProposalChanges,
  readDecisionPolicyFromEnv,
  summarizeDecisions,
  type ChangeDecision,
} from "@trybacked/ontology-ai";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { commandErrorMessage, hasFlag, parseHelpOnlyArgs, readFlagValue } from "../args.js";
import { COMMANDS, formatCliCommand } from "../config.js";
import { findWorkspaceRoot } from "../env.js";
import { renderReviewReport } from "../review/render-review.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";
import { renderLogo } from "../ui/logo.js";

const CHANGE_SET_PATH = ".backed/change-set.json";
const JSON_FLAG = "--json";
const ACCEPT_ABOVE_FLAG = "--accept-above";
const DEFAULT_ACCEPT_ABOVE = 0.8;

function parseReviewArgs(args: string[]): { help: boolean; json: boolean; threshold: number } {
  const flagIndex = args.indexOf(ACCEPT_ABOVE_FLAG);
  const acceptAbove = readFlagValue(args, ACCEPT_ABOVE_FLAG);
  if (flagIndex !== -1 && acceptAbove === undefined) {
    throw new Error(`${ACCEPT_ABOVE_FLAG} requires a value`);
  }
  const rest = args.filter(
    (arg, index) =>
      arg !== JSON_FLAG && (flagIndex === -1 || (index !== flagIndex && index !== flagIndex + 1)),
  );
  const threshold = acceptAbove !== undefined ? Number(acceptAbove) : DEFAULT_ACCEPT_ABOVE;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error(`${ACCEPT_ABOVE_FLAG} must be a number between 0 and 1`);
  }
  return { help: parseHelpOnlyArgs(rest).help, json: hasFlag(args, JSON_FLAG), threshold };
}

function advisorLabel(decisions: readonly ChangeDecision[], sageConfigured: boolean): string {
  if (!sageConfigured) {
    return "confidence threshold (SAGE_API_KEY not set)";
  }
  const modelId = decisions.find((decision) => decision.advisor !== undefined)?.advisor?.modelId;
  return modelId !== undefined ? `Sage · ${modelId}` : "Sage (unavailable, routed to review)";
}

export const reviewCommand: CommandHandler = async (args) => {
  const ui = initUi();
  try {
    const { help, json, threshold } = parseReviewArgs(args);
    if (help) {
      ui.log(`Usage: ${formatCliCommand(COMMANDS.REVIEW)} [--accept-above 0.8] [--json]`);
      return;
    }
    const root = findWorkspaceRoot(process.cwd());
    const changeSetFile = path.join(root, CHANGE_SET_PATH);
    if (!existsSync(changeSetFile)) {
      ui.writeError(`No change set at ${changeSetFile}. Run induction first.`);
      process.exitCode = 1;
      return;
    }
    const changeSet = parseChangeSet(JSON.parse(readFileSync(changeSetFile, "utf8")));
    const ontology = readOntologyV2Yaml(root);
    const decisionModel = createDecisionModelFromEnv(process.env);

    if (!json) {
      ui.log(renderLogo());
      ui.blank();
    }
    const spinner = json ? undefined : ui.spinner("Reviewing ontology changes");
    const decisions = await decideProposalChanges({
      changes: changeSet.changes,
      baselineOntology: ontology,
      reviewPolicy: { autoApproveThreshold: threshold, allowNonBreakingAutoApprove: true },
      decisionPolicy: readDecisionPolicyFromEnv(process.env),
      decisionModel,
    });
    spinner?.stop();

    const reviewed = changeSet.changes.flatMap((change, index) => {
      const decision = decisions[index];
      return decision === undefined ? [] : [{ command: change.command, decision }];
    });
    const approved = reviewed
      .filter(({ decision }) => decision.verdict === "auto_approve")
      .map(({ command }) => command);
    writeOntologyV2Yaml(root, applyCommandsV2(ontology, approved));

    const summary = summarizeDecisions(decisions);
    if (json) {
      ui.log(JSON.stringify({ threshold, ...summary, decisions }, null, 2));
      return;
    }
    renderReviewReport(ui, reviewed, advisorLabel(decisions, decisionModel !== undefined));
    ui.writeSuccess(
      `Applied ${String(summary.autoApproved)} change(s) · ${String(summary.needsReview)} to review · ${String(summary.recommendReject)} recommended reject`,
    );
  } catch (error) {
    ui.writeError(commandErrorMessage(error));
    process.exitCode = 1;
  }
};
