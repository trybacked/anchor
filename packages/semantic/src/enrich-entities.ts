import { ENTITY_MENTION_TYPE, describeTerms } from "@backed/core";
import type { DomainTerm, DomainVocabulary } from "@backed/core";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { EMPTY_BURST_USAGE, runBurst, type BurstUsage } from "./burst.js";
import { ENTITY_ENRICHMENT_MAX_CONTEXT_SNIPPETS, ENTITY_ENRICHMENT_MAX_SNIPPET_CHARS, ENTITY_ENRICHMENT_MAX_SUMMARY_CHARS, } from "./constants.js";
import { resolveSemanticRequestTimeoutMs } from "./env.js";
import { entityIdFromName } from "./extract-document-mentions.js";
import type { EntityRecord, RawDocumentMention } from "./extract-document-mentions.js";
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
    onProgress?: (message: string) => void;
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
function buildEnrichmentPrompt(entities: Map<string, EntityRecord>, mentions: RawDocumentMention[]): string {
    const blocks = [...entities.values()].map((entity) => {
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
export async function enrichEntities(options: EnrichEntitiesOptions): Promise<EnrichEntitiesResult> {
    if (options.entities.size === 0) {
        return { entities: options.entities, usage: EMPTY_BURST_USAGE };
    }
    options.onProgress?.(`Enriching ${String(options.entities.size)} ${options.vocabulary.entityLabel}(s) via LLM...`);
    const result = await runBurst({
        model: options.model,
        system: buildSystemPrompt(options.vocabulary),
        prompt: buildEnrichmentPrompt(options.entities, options.mentions),
        schema: buildEnrichmentSchema(options.vocabulary),
        schemaName: "entity_enrichment",
        timeoutMs: resolveSemanticRequestTimeoutMs(),
        ...(options.onProgress !== undefined ? { onWaiting: options.onProgress } : {}),
    });
    const output = result.output as {
        entities: EnrichedEntity[];
    };
    return {
        entities: applyEnrichment(options.entities, output.entities),
        usage: result.usage,
    };
}
