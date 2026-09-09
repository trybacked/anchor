import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import {
    ProposalSchema,
    ReviewSchema,
    applyReview,
    serializeModelYaml,
} from "@backed/core";
import type { Proposal, Review, ReviewAnswer } from "@backed/core";
import { resolveReviewConfidenceThreshold } from "@backed/semantic";
import { resolveTenantWorkspace } from "@backed/runner";

export function loadTenantProposal(dataRoot: string, tenantId: string): Proposal | null {
    const { paths } = resolveTenantWorkspace(dataRoot, tenantId);
    if (!existsSync(paths.proposalPath)) {
        return null;
    }
    return ProposalSchema.parse(JSON.parse(readFileSync(paths.proposalPath, "utf8")));
}

export async function applyTenantReview(
    dataRoot: string,
    tenantId: string,
    answers: ReviewAnswer[],
    env: Record<string, string | undefined> = process.env,
): Promise<{ modelYaml: string; staleAnswerCount: number }> {
    const proposal = loadTenantProposal(dataRoot, tenantId);
    if (proposal === null) {
        throw new ReviewNotFoundError("No proposal available for review");
    }
    const review: Review = {
        runId: proposal.runId,
        answeredAt: new Date().toISOString(),
        answers,
    };
    ReviewSchema.parse(review);
    const { paths } = resolveTenantWorkspace(dataRoot, tenantId);
    await mkdir(paths.persistDir, { recursive: true });
    await writeFile(paths.reviewPath, `${JSON.stringify(review, null, 2)}\n`, "utf8");
    const { model, staleAnswerCount } = applyReview(proposal, review, new Date(), {
        reviewConfidenceThreshold: resolveReviewConfidenceThreshold(env),
    });
    if (staleAnswerCount === answers.length && answers.length > 0) {
        throw new StaleReviewError(staleAnswerCount);
    }
    const modelYaml = serializeModelYaml(model);
    await writeFile(paths.modelPath, modelYaml, "utf8");
    return { modelYaml, staleAnswerCount };
}

export class ReviewNotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ReviewNotFoundError";
    }
}

export class StaleReviewError extends Error {
    constructor(public readonly staleAnswerCount: number) {
        super(`All ${String(staleAnswerCount)} review answer(s) are stale for the current proposal`);
        this.name = "StaleReviewError";
    }
}
