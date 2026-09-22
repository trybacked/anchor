import { input, select } from "@inquirer/prompts";
import {
  DEFAULT_REVIEW_CONFIDENCE_THRESHOLD,
  DiscoveryReportSchema,
  ProposalSchema,
  applyReview,
  applyReviewLifecycle,
  appendAuditEvents,
  buildAutoConfirmAuditEvents,
  buildReviewAuditEvents,
  hasRunArtifact,
  listRunIds,
  readRunArtifact,
  writeModelYaml,
  writeRunArtifact,
} from "@trybacked/core";
import type { EvidenceTable, Proposal, ReviewAnswer } from "@trybacked/core";
import path from "node:path";
import { wantsHeadlessCommand } from "../args.js";
import { findWorkspaceRoot } from "../env.js";
import { MESSAGES, reviewNextSteps } from "../messages.js";
import { defaultReviewer } from "../reviewer.js";
import type { CommandHandler } from "../types.js";
import { createPromptTheme, getUi, initUi } from "../ui/index.js";

const REVIEW_CONFIDENCE_THRESHOLD_ENV = "BACKED_REVIEW_CONFIDENCE_THRESHOLD";

function resolveReviewConfidenceThreshold(env: Record<string, string | undefined>): number {
  const raw = env[REVIEW_CONFIDENCE_THRESHOLD_ENV];
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_REVIEW_CONFIDENCE_THRESHOLD;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    throw new Error(`Invalid ${REVIEW_CONFIDENCE_THRESHOLD_ENV}: "${raw}" (expected 0 < n <= 1).`);
  }
  return parsed;
}

function renderEvidenceTable(ui: ReturnType<typeof getUi>, evidence: EvidenceTable): string {
  const rows = [evidence.columns, ...evidence.rows];
  const widths = evidence.columns.map((_, columnIndex) =>
    Math.max(...rows.map((row) => (row[columnIndex] ?? "").length)),
  );
  const renderRow = (row: string[], header = false): string =>
    row
      .map((cell, index) => {
        const padded = cell.padEnd(widths[index] ?? 0);
        return header ? ui.accent(padded) : padded;
      })
      .join("  ");
  return [
    ui.dim(`  ${evidence.title}`),
    `  ${renderRow(evidence.columns, true)}`,
    ...evidence.rows.map((row) => `  ${renderRow(row)}`),
  ].join("\n");
}

async function askQuestion(
  proposal: Proposal,
  questionIndex: number,
  theme: ReturnType<typeof createPromptTheme>,
): Promise<ReviewAnswer | null> {
  const ui = getUi();
  const question = proposal.questions[questionIndex];
  if (!question) {
    return null;
  }
  ui.blank();
  ui.hr();
  ui.log(
    `${ui.label(`Question ${String(questionIndex + 1)}/${String(proposal.questions.length)}`)} ${ui.dim(`· risk ${question.risk.toFixed(2)}`)}`,
  );
  ui.log(`  ${question.question}`);
  ui.log(renderEvidenceTable(ui, question.evidence));
  const decision = await select({
    message: "Answer:",
    choices: [
      { name: "Yes", value: "yes" as const },
      { name: "No", value: "no" as const },
      { name: "Rename", value: "rename" as const },
    ],
    theme,
  });
  if (decision === "rename") {
    const newName = await input({
      message: "New name:",
      validate: (value) => value.trim().length > 0 || "Name cannot be empty.",
      theme,
    });
    return { questionId: question.id, decision, newName: newName.trim() };
  }
  return { questionId: question.id, decision };
}

function findLatestRunWithProposal(root: string): string | null {
  const runIds = listRunIds(root).reverse();
  return runIds.find((runId) => hasRunArtifact(root, runId, "proposal")) ?? null;
}

export const reviewCommand: CommandHandler = async () => {
  const ui = initUi();
  const root = findWorkspaceRoot(process.cwd());
  const runId = findLatestRunWithProposal(root);
  if (!runId) {
    ui.writeError(MESSAGES.noProposal);
    process.exitCode = 1;
    return;
  }
  const proposal = readRunArtifact(root, runId, "proposal", ProposalSchema);
  if (wantsHeadlessCommand()) {
    ui.log(`Review pending: ${String(proposal.questions.length)} question(s) for run ${runId}`);
    return;
  }
  ui.heading("Review proposal");
  ui.step(`${String(proposal.questions.length)} question(s) · run ${ui.accent(runId)}`);
  if (proposal.doubts.length > 0) {
    ui.blank();
    ui.log(ui.label("Open doubts (no answer required now):"));
    for (const doubt of proposal.doubts) {
      ui.log(`  ${ui.warn("?")} ${ui.dim(`[${doubt.topic}]`)} ${doubt.question}`);
    }
  }
  const theme = createPromptTheme();
  const answers: ReviewAnswer[] = [];
  for (let index = 0; index < proposal.questions.length; index += 1) {
    const answer = await askQuestion(proposal, index, theme);
    if (answer) {
      answers.push(answer);
    }
  }
  const reviewer = defaultReviewer();
  const review = {
    runId,
    answeredAt: new Date().toISOString(),
    answers,
    ...(reviewer !== undefined ? { reviewer } : {}),
  };
  const reviewPath = writeRunArtifact(root, runId, "review", review);
  ui.blank();
  ui.writeSuccess(`Answers saved → ${ui.path(reviewPath)}`);
  const reviewThreshold = resolveReviewConfidenceThreshold(process.env);
  const { model, staleAnswerCount } = applyReview(proposal, review, new Date(), {
    reviewConfidenceThreshold: reviewThreshold,
  });
  const baseDiscovery = hasRunArtifact(root, runId, "discovery")
    ? readRunArtifact(root, runId, "discovery", DiscoveryReportSchema).ontology
    : undefined;
  const { ontology: lifecycleOntology } = applyReviewLifecycle(proposal, review, {
    ontologyId: path.basename(root),
    reviewConfidenceThreshold: reviewThreshold,
    ...(baseDiscovery !== undefined ? { baseOntology: baseDiscovery } : {}),
  });
  const lifecyclePath = writeRunArtifact(root, runId, "lifecycle", lifecycleOntology);
  ui.writeSuccess(`Lifecycle → ${ui.path(lifecyclePath)}`);

  const auditEvents = [
    ...buildReviewAuditEvents(proposal, review),
    ...buildAutoConfirmAuditEvents(proposal, review, model.entities, model.relations, model.rules, {
      reviewConfidenceThreshold: reviewThreshold,
    }),
  ];
  writeRunArtifact(root, runId, "audit", { version: 1, events: auditEvents });
  appendAuditEvents(root, auditEvents);
  if (staleAnswerCount > 0) {
    ui.writeWarn(
      `${String(staleAnswerCount)} review answer(s) ignored — they no longer match this proposal.`,
    );
    if (staleAnswerCount === review.answers.length && review.answers.length > 0) {
      ui.writeError("All review answers are stale for this proposal.");
      process.exitCode = 1;
      return;
    }
  }
  const modelPath = writeModelYaml(root, model);
  ui.writeSuccess(
    `Model written → ${ui.path(modelPath)} (${String(model.entities.length)} entities, ${String(model.relations.length)} relations, ${String(model.rules.length)} rules)`,
  );
  ui.blank();
  ui.step(reviewNextSteps());
};
