import {
  ProposalSchema,
  applyReview,
  hasRunArtifact,
  listRunIds,
  readRunArtifact,
  writeModelYaml,
  writeRunArtifact,
} from "@backed/core";
import type { EvidenceTable, Proposal, ReviewAnswer } from "@backed/core";
import { input, select } from "@inquirer/prompts";

import type { CommandHandler } from "../types.js";

function renderEvidenceTable(evidence: EvidenceTable): string {
  const rows = [evidence.columns, ...evidence.rows];
  const widths = evidence.columns.map((_, columnIndex) =>
    Math.max(...rows.map((row) => (row[columnIndex] ?? "").length)),
  );
  const renderRow = (row: string[]): string =>
    row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join("  ");

  return [
    `  ${evidence.title}`,
    `  ${renderRow(evidence.columns)}`,
    ...evidence.rows.map((row) => `  ${renderRow(row)}`),
  ].join("\n");
}

async function askQuestion(
  proposal: Proposal,
  questionIndex: number,
): Promise<ReviewAnswer | null> {
  const question = proposal.questions[questionIndex];
  if (!question) {
    return null;
  }

  console.log(
    `\nDomanda ${String(questionIndex + 1)} di ${String(proposal.questions.length)} — rischio ${question.risk.toFixed(2)}`,
  );
  console.log(question.question);
  console.log(renderEvidenceTable(question.evidence));

  const decision = await select({
    message: "Risposta:",
    choices: [
      { name: "Sì", value: "yes" as const },
      { name: "No", value: "no" as const },
      { name: "Rinomina", value: "rename" as const },
    ],
  });

  if (decision === "rename") {
    const newName = await input({
      message: "Nuovo nome:",
      validate: (value) => value.trim().length > 0 || "Il nome non può essere vuoto.",
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
  const root = process.cwd();

  const runId = findLatestRunWithProposal(root);
  if (!runId) {
    console.error('Nessuna proposta da rivedere. Esegui prima "backed model" (senza --no-llm).');
    process.exitCode = 1;
    return;
  }

  const proposal = readRunArtifact(root, runId, "proposal", ProposalSchema);
  console.log(`Review della run ${runId}: ${String(proposal.questions.length)} domande.`);

  if (proposal.doubts.length > 0) {
    console.log(`\nDubbi dichiarati dal modello (non richiedono risposta ora):`);
    for (const doubt of proposal.doubts) {
      console.log(`  - [${doubt.topic}] ${doubt.question}`);
    }
  }

  const answers: ReviewAnswer[] = [];
  for (let index = 0; index < proposal.questions.length; index += 1) {
    const answer = await askQuestion(proposal, index);
    if (answer) {
      answers.push(answer);
    }
  }

  const review = { runId, answeredAt: new Date().toISOString(), answers };
  const reviewPath = writeRunArtifact(root, runId, "review", review);
  console.log(`\nRisposte salvate: ${reviewPath}`);

  const model = applyReview(proposal, review);
  const modelPath = writeModelYaml(root, model);
  console.log(
    `Modello scritto: ${modelPath} — ${String(model.entities.length)} entità, ${String(model.relations.length)} relazioni, ${String(model.rules.length)} regole.`,
  );
  console.log('Prossimi passi: "backed serve" per esporlo agli agenti, "backed diff" dopo la prossima run.');
};
