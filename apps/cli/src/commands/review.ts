import {
  DocumentCatalogSchema,
  ProposalSchema,
  applyReview,
  hasRunArtifact,
  listRunIds,
  patchWorkspaceConfig,
  readRunArtifact,
  readWorkspaceConfig,
  writeModelYaml,
  writeRunArtifact,
} from "@backed/core";
import type { DocumentCatalog, EvidenceTable, Proposal, Review, ReviewAnswer } from "@backed/core";
import { input, select } from "@inquirer/prompts";

import { findWorkspaceRoot } from "../env.js";
import { createPromptTheme, getUi, initUi } from "../ui/index.js";
import type { CommandHandler } from "../types.js";

function slugifyDocumentTypeId(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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

function applyDocumentTypeRenamesFromReview(
  root: string,
  proposal: Proposal,
  review: Review,
  documentCatalog: DocumentCatalog | undefined,
): void {
  if (documentCatalog === undefined) {
    return;
  }

  const ui = getUi();
  const typeIdByEntityId = new Map(
    documentCatalog.documentTypes.map((type) => [slugifyDocumentTypeId(type.id), type.id]),
  );
  const questionsById = new Map(proposal.questions.map((question) => [question.id, question]));
  const config = readWorkspaceConfig(root);
  let hints = config.documentTypeHints;
  let updated = false;

  for (const answer of review.answers) {
    if (answer.decision !== "rename" || answer.newName === undefined) {
      continue;
    }

    const question = questionsById.get(answer.questionId);
    if (question === undefined || question.kind !== "entity") {
      continue;
    }

    const documentTypeId = typeIdByEntityId.get(question.targetId);
    if (documentTypeId === undefined) {
      continue;
    }

    hints = hints.map((hint) =>
      hint.documentType === documentTypeId
        ? { ...hint, documentTypeLabel: answer.newName! }
        : hint,
    );
    updated = true;
    ui.writeSuccess(
      `Config updated: document type "${documentTypeId}" → "${answer.newName}"`,
    );
  }

  if (updated) {
    patchWorkspaceConfig(root, { documentTypeHints: hints });
  }
}

export const reviewCommand: CommandHandler = async () => {
  const ui = initUi();
  const root = findWorkspaceRoot(process.cwd());

  const runId = findLatestRunWithProposal(root);
  if (!runId) {
    ui.writeError('No proposal to review. Run "backed model" first.');
    process.exitCode = 1;
    return;
  }

  const proposal = readRunArtifact(root, runId, "proposal", ProposalSchema);
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

  const review = { runId, answeredAt: new Date().toISOString(), answers };
  const reviewPath = writeRunArtifact(root, runId, "review", review);

  ui.blank();
  ui.writeSuccess(`Answers saved → ${ui.path(reviewPath)}`);

  const model = applyReview(proposal, review);
  const modelPath = writeModelYaml(root, model);
  ui.writeSuccess(
    `Model written → ${ui.path(modelPath)} (${String(model.entities.length)} entities, ${String(model.relations.length)} relations, ${String(model.rules.length)} rules)`,
  );

  const documentCatalog = hasRunArtifact(root, runId, "documents")
    ? readRunArtifact(root, runId, "documents", DocumentCatalogSchema)
    : undefined;
  applyDocumentTypeRenamesFromReview(root, proposal, review, documentCatalog);

  ui.blank();
  ui.step('Run "backed serve" to expose the model to agents, "backed diff" after the next run.');
};
