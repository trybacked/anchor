import { EMPTY_DOMAIN_VOCABULARY, ProposalSchema } from "@backed/core";
import type { DocumentCatalog, DomainVocabulary, ProfileReport, Proposal } from "@backed/core";
import type { BurstUsage } from "./burst.js";
import type { LlmCacheContext } from "./llm-cache.js";
import type { SemanticModels } from "./env.js";
import {
    resolveClassificationBatchSize,
    resolveReviewConfidenceThreshold,
    resolveSemanticRequestTimeoutMs,
} from "./env.js";
import { compressProfile } from "./compress.js";
import { formatRoutingSummary, routeTables } from "./table-routing.js";
import {
    assembleProposal,
    buildReviewQuestions,
    finalizeReviewQuestions,
    lowConfidenceDoubts,
} from "./propose-assembly.js";
import { resolveOntologyStrategy, runOntologyStrategy } from "./propose-ontology.js";
import { classifyAllColumns } from "./propose-classification.js";

export interface ProposeModelOptions {
    profile: ProfileReport;
    runId: string;
    models: SemanticModels;
    now?: Date;
    reviewConfidenceThreshold?: number;
    documentCatalog?: DocumentCatalog;
    vocabulary?: DomainVocabulary;
    extractionUsage?: BurstUsage;
    onProgress?: (message: string) => void;
    onBatchProgress?: (progress: { completed: number; total: number }) => void;
    llmCache?: LlmCacheContext;
}

function sumUsageMany(usages: BurstUsage[]): Proposal["usage"] {
    let inputTokens = 0;
    let outputTokens = 0;
    const costs: number[] = [];
    for (const usage of usages) {
        inputTokens += usage.inputTokens;
        outputTokens += usage.outputTokens;
        if (usage.costUsd !== null) {
            costs.push(usage.costUsd);
        }
    }
    return {
        inputTokens,
        outputTokens,
        costUsd: costs.length > 0 ? costs.reduce((total, cost) => total + cost, 0) : null,
    };
}

export async function proposeModel(options: ProposeModelOptions): Promise<Proposal> {
    const onProgress = options.onProgress;
    const documentCatalog = options.documentCatalog;
    const vocabulary = options.vocabulary ?? EMPTY_DOMAIN_VOCABULARY;
    const timeoutMs = resolveSemanticRequestTimeoutMs();
    const batchSize = resolveClassificationBatchSize();
    const reviewConfidenceThreshold =
        options.reviewConfidenceThreshold ?? resolveReviewConfidenceThreshold();
    const routing = routeTables(compressProfile(options.profile), documentCatalog);
    const routingSummary = formatRoutingSummary(routing, documentCatalog);
    if (routingSummary.length > 0) {
        onProgress?.(routingSummary);
    }
    const { classification, usage: classificationUsage } = await classifyAllColumns(
        routing,
        documentCatalog,
        vocabulary,
        options.profile,
        options.models,
        batchSize,
        timeoutMs,
        options.llmCache,
        onProgress,
        options.onBatchProgress,
    );
    const ontologyStrategy = resolveOntologyStrategy(routing, documentCatalog);
    const {
        output: ontologyOutput,
        usage: ontologyUsage,
        extraDoubts,
    } = await runOntologyStrategy(
        ontologyStrategy,
        options.models,
        classification,
        timeoutMs,
        options.llmCache,
        onProgress,
    );
    const assembly = assembleProposal(
        ontologyOutput,
        extraDoubts,
        classification,
        options.profile,
        routing,
        documentCatalog,
        vocabulary,
    );
    const allQuestions = buildReviewQuestions(
        assembly,
        routing,
        documentCatalog,
        vocabulary,
        reviewConfidenceThreshold,
    );
    const questions = finalizeReviewQuestions(assembly, allQuestions);
    const questionTargets = new Set(questions.map((question) => `${question.kind}:${question.targetId}`));
    assembly.doubts.push(...lowConfidenceDoubts(assembly, questionTargets));
    return ProposalSchema.parse({
        runId: options.runId,
        generatedAt: (options.now ?? new Date()).toISOString(),
        entities: assembly.entities,
        relations: assembly.relations,
        rules: assembly.rules,
        doubts: assembly.doubts,
        questions,
        usage: sumUsageMany([
            classificationUsage,
            ontologyUsage,
            ...(options.extractionUsage !== undefined ? [options.extractionUsage] : []),
        ]),
    });
}
