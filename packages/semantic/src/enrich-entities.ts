import { ENTITY_MENTION_TYPE, describeTerms } from "@backed/core";
import type { DomainTerm, DomainVocabulary } from "@backed/core";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { EMPTY_BURST_USAGE, runBurst, sumBurstUsage, type BurstUsage } from "./burst.js";
import { mapWithConcurrency } from "./concurrency.js";
import { ENTITY_ENRICHMENT_BATCH_SIZE, ENTITY_ENRICHMENT_CONCURRENCY, ENTITY_ENRICHMENT_MAX_CONTEXT_SNIPPETS, ENTITY_ENRICHMENT_MAX_SNIPPET_CHARS, ENTITY_ENRICHMENT_MAX_SUMMARY_CHARS, } from "./constants.js";
import { resolveSemanticRequestTimeoutMs } from "./env.js";
import { burstCacheFields, type LlmCacheContext } from "./llm-cache.js";
import { entityIdFromName } from "./extract-document-mentions.js";
import type { EntityRecord, RawDocumentMention } from "./extract-document-mentions.js";
export { ENTITY_ENRICHMENT_BATCH_SIZE, ENTITY_ENRICHMENT_CONCURRENCY } from "./constants.js";
function termEnum(terms: DomainTerm[]): z.ZodTypeAny {
    const ids = terms.map((term) => term.id);
    return ids.length > 0 ? z.enum(ids as [
        string,
        ...string[]
    ]) : z.string();
}
function buildEnrichmentSchema(vocabulary: DomainVocabulary) {
    return z.object({
        entities: z.array(z.object({
            entityId: z.string(),
            sector: termEnum(vocabulary.entitySectors),
            role: termEnum(vocabulary.entityRoles),
            summary: z.string().max(ENTITY_ENRICHMENT_MAX_SUMMARY_CHARS),
            confidence: z.number().min(0).max(1),
        })),
    });
}
function buildSystemPrompt(vocabulary: DomainVocabulary): string {
    return `You classify the ${vocabulary.entityLabel} entries mentioned in a document corpus.

Corpus: ${vocabulary.corpusSummary}

For each entry infer:
- sector: what it does
${describeTerms(vocabulary.entitySectors)}
- role: the function it plays in these documents
${describeTerms(vocabulary.entityRoles)}
- summary: one concise sentence in ${vocabulary.language} describing it in context
- confidence: 0-1

Use the mention context only. Prefer explicit cues in the text, and choose the catch-all category when uncertain.`;
}
export interface EnrichEntitiesOptions {
    model: LanguageModel;
    entities: Map<string, EntityRecord>;
    mentions: RawDocumentMention[];
    vocabulary: DomainVocabulary;
    llmCache?: LlmCacheContext;
    onProgress?: (message: string) => void;
    onBatchProgress?: (progress: {
        completed: number;
        total: number;
    }) => void;
}
export interface EnrichEntitiesResult {
    entities: Map<string, EntityRecord>;
    usage: BurstUsage;
}
function collectContextSnippets(entityId: string, mentions: RawDocumentMention[]): string[] {
    const snippets: string[] = [];
    const seen = new Set<string>();
    for (const mention of mentions) {
        if (mention.mentionType !== ENTITY_MENTION_TYPE) {
            continue;
        }
        if (entityIdFromName(mention.normalizedValue) !== entityId) {
            continue;
        }
        const snippet = mention.context.trim().slice(0, ENTITY_ENRICHMENT_MAX_SNIPPET_CHARS);
        if (snippet.length === 0 || seen.has(snippet)) {
            continue;
        }
        seen.add(snippet);
        snippets.push(snippet);
        if (snippets.length >= ENTITY_ENRICHMENT_MAX_CONTEXT_SNIPPETS) {
            break;
        }
    }
    return snippets;
}
function buildEnrichmentPrompt(entities: EntityRecord[], mentions: RawDocumentMention[]): string {
    const blocks = entities.map((entity) => {
        const snippets = collectContextSnippets(entity.entityId, mentions);
        const contextText = snippets.length > 0
            ? snippets.map((snippet, index) => `${String(index + 1)}. ${snippet}`).join("\n")
            : "(no context snippets)";
        return [
            `entityId: ${entity.entityId}`,
            `name: ${entity.name}`,
            `mentions: ${String(entity.mentionCount)} across ${String(entity.documentCount)} document(s)`,
            "context:",
            contextText,
        ].join("\n");
    });
    return `Classify each entry:\n\n${blocks.join("\n\n---\n\n")}`;
}
interface EnrichedEntity {
    entityId: string;
    sector: string;
    role: string;
    summary: string;
    confidence: number;
}
function applyEnrichment(entities: Map<string, EntityRecord>, enriched: EnrichedEntity[]): Map<string, EntityRecord> {
    const next = new Map(entities);
    for (const entry of enriched) {
        const existing = next.get(entry.entityId);
        if (existing === undefined) {
            continue;
        }
        next.set(entry.entityId, {
            ...existing,
            sector: entry.sector,
            role: entry.role,
            summary: entry.summary,
            enrichmentConfidence: entry.confidence,
        });
    }
    return next;
}
function chunkEntities(entities: EntityRecord[], size: number): EntityRecord[][] {
    const batches: EntityRecord[][] = [];
    for (let index = 0; index < entities.length; index += size) {
        batches.push(entities.slice(index, index + size));
    }
    return batches;
}
export async function enrichEntities(options: EnrichEntitiesOptions): Promise<EnrichEntitiesResult> {
    if (options.entities.size === 0) {
        return { entities: options.entities, usage: EMPTY_BURST_USAGE };
    }
    const entityList = [...options.entities.values()];
    const batches = chunkEntities(entityList, ENTITY_ENRICHMENT_BATCH_SIZE);
    const schema = buildEnrichmentSchema(options.vocabulary);
    const system = buildSystemPrompt(options.vocabulary);
    options.onProgress?.(`Enriching ${String(entityList.length)} ${options.vocabulary.entityLabel}(s) in ${String(batches.length)} batch(es)...`);
    let completed = 0;
    const results = await mapWithConcurrency(batches, ENTITY_ENRICHMENT_CONCURRENCY, async (batch) => {
        const result = await runBurst({
            model: options.model,
            system,
            prompt: buildEnrichmentPrompt(batch, options.mentions),
            schema,
            schemaName: "entity_enrichment",
            timeoutMs: resolveSemanticRequestTimeoutMs(),
            ...burstCacheFields(options.llmCache),
        });
        completed += 1;
        options.onBatchProgress?.({ completed, total: batches.length });
        return result;
    });
    const enriched: EnrichedEntity[] = [];
    for (const result of results) {
        const output = result.output as {
            entities: EnrichedEntity[];
        };
        enriched.push(...output.entities);
    }
    return {
        entities: applyEnrichment(options.entities, enriched),
        usage: sumBurstUsage(...results.map((result) => result.usage)),
    };
}
