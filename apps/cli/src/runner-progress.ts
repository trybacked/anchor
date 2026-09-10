import {
    formatPipelineDuration,
    type PipelineProgressReporter,
    type RunAnchorPipelineResult,
} from "@backed/runner";
import { COMMANDS, formatCliCommand } from "./config.js";
import { createAiProgressReporter } from "./ui/index.js";
import type { Ui } from "./ui/index.js";

export function createCliPipelineProgress(ui: Ui): PipelineProgressReporter {
    const aiProgress = createAiProgressReporter((message) => {
        ui.detail(message);
    });
    return {
        heading: (message) => {
            ui.heading(message);
        },
        step: (message) => {
            ui.step(message);
        },
        detail: (message) => {
            ui.detail(message);
        },
        success: (message) => {
            ui.writeSuccess(message);
        },
        warn: (message) => {
            ui.writeWarn(message);
        },
        error: (message) => {
            ui.writeError(message);
        },
        track: (label, completed, total) => {
            aiProgress.track(label, completed, total);
        },
        indeterminate: (message) => {
            aiProgress.indeterminate(message);
        },
    };
}

export function printPipelineSummary(ui: Ui, result: RunAnchorPipelineResult, skipEmbed: boolean): void {
    const { proposal, stats } = result;
    ui.blank();
    ui.writeSuccess(`${String(proposal.entities.length)} entities, ${String(proposal.relations.length)} relations`);
    if (proposal.doubts.length > 0) {
        ui.log(`  ${ui.label("Doubts")}  ${String(proposal.doubts.length)} open`);
    }
    if (proposal.usage) {
        const cost = proposal.usage.costUsd !== null ? ` ${ui.dim(`(~$${proposal.usage.costUsd.toFixed(4)})`)}` : "";
        ui.log(`  ${ui.label("LLM")}     ${String(proposal.usage.inputTokens)} in / ${String(proposal.usage.outputTokens)} out${cost}`);
    }
    ui.step(`${String(proposal.questions.length)} review question(s) — run ${ui.command(formatCliCommand(COMMANDS.REVIEW))}`);
    ui.blank();
    const parts = [
        `${ui.label("Ingest")} ${formatPipelineDuration(stats.ingestMs)}`,
        skipEmbed
            ? `${ui.label("Documents")} ${formatPipelineDuration(stats.documentsMs)} ${ui.dim(`(extraction ${formatPipelineDuration(stats.extractionMs)}, embed skipped)`)}`
            : `${ui.label("Documents")} ${formatPipelineDuration(stats.documentsMs)} ${ui.dim(`(extraction ${formatPipelineDuration(stats.extractionMs)}, embed ${formatPipelineDuration(stats.embedMs)})`)}`,
        `${ui.label("Profile")} ${formatPipelineDuration(stats.profileMs)}`,
        `${ui.label("Proposal")} ${formatPipelineDuration(stats.proposalMs)}`,
    ];
    ui.log(parts.join(` ${ui.dim("·")} `));
}
