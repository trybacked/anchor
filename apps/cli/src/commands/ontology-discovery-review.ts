import { readFileSync } from "node:fs";
import { readControlPlaneEnv, controlPlaneFetch } from "../control-plane/client.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

function parseArgs(args: string[]): {
  tenantId: string;
  runId: string;
  apply: boolean;
  answersPath?: string;
  autoYes: boolean;
} | undefined {
  const tenantId = args[0];
  const runId = args[1];
  if (tenantId === undefined || runId === undefined) {
    return undefined;
  }
  let apply = false;
  let autoYes = false;
  let answersPath: string | undefined;
  for (const arg of args.slice(2)) {
    if (arg === "--apply") {
      apply = true;
    } else if (arg === "--yes-all") {
      autoYes = true;
    } else if (!arg.startsWith("-")) {
      answersPath = arg;
    }
  }
  return { tenantId, runId, apply, autoYes, ...(answersPath !== undefined ? { answersPath } : {}) };
}

export const ontologyDiscoveryReviewCommand: CommandHandler = async (args) => {
  const ui = initUi();
  const parsed = parseArgs(args);
  const client = readControlPlaneEnv();
  if (parsed === undefined) {
    ui.writeError(
      "Usage: backed ontology discovery-review <tenantId> <runId> [answers.json] [--apply] [--yes-all]",
    );
    process.exitCode = 1;
    return;
  }
  if (client === undefined) {
    ui.writeError("Set BACKED_CONTROL_PLANE_URL and CONTROL_PLANE_INTERNAL_TOKEN.");
    process.exitCode = 1;
    return;
  }
  const detailResponse = await controlPlaneFetch(
    client,
    parsed.tenantId,
    `/authoring/discovery/runs/${encodeURIComponent(parsed.runId)}`,
  );
  if (!detailResponse.ok) {
    ui.writeError(await detailResponse.text());
    process.exitCode = 1;
    return;
  }
  const detail = (await detailResponse.json()) as {
    proposal: {
      questions: { id: string; targetId: string; kind: string }[];
    };
  };
  type ReviewAnswer = {
    questionId: string;
    decision: "yes" | "no" | "rename";
    renameTo?: string;
  };
  let answers: ReviewAnswer[] = [];
  if (parsed.answersPath !== undefined) {
    const raw = JSON.parse(readFileSync(parsed.answersPath, "utf8")) as {
      answers?: ReviewAnswer[];
    };
    answers = raw.answers ?? [];
  } else if (parsed.autoYes) {
    answers = detail.proposal.questions.map((question) => ({
      questionId: question.id,
      decision: "yes" as const,
    }));
  }
  const draftResponse = await controlPlaneFetch(client, parsed.tenantId, "/authoring/ontology/draft");
  if (!draftResponse.ok) {
    ui.writeError(await draftResponse.text());
    process.exitCode = 1;
    return;
  }
  const draft = (await draftResponse.json()) as { revision: number };
  const reviewBody = {
    runId: parsed.runId,
    answeredAt: new Date().toISOString(),
    answers,
    apply: parsed.apply,
    ...(parsed.apply ? { requireCompleteReview: true } : {}),
  };
  const reviewResponse = await controlPlaneFetch(
    client,
    parsed.tenantId,
    `/authoring/discovery/runs/${encodeURIComponent(parsed.runId)}/review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reviewBody),
      ...(parsed.apply ? { revision: draft.revision } : {}),
    },
  );
  if (!reviewResponse.ok) {
    ui.writeError(await reviewResponse.text());
    process.exitCode = 1;
    return;
  }
  const result = (await reviewResponse.json()) as {
    applied: boolean;
    commands: unknown[];
    revision?: number;
    staleAnswerCount: number;
  };
  ui.writeSuccess(
    result.applied
      ? `Applied ${String(result.commands.length)} command(s) at revision ${String(result.revision ?? "?")}`
      : `Preview: ${String(result.commands.length)} command(s) (pass --apply to merge draft)`,
  );
  if (result.staleAnswerCount > 0) {
    ui.detail(`Stale answers ignored: ${String(result.staleAnswerCount)}`);
  }
};
