import { DomainVocabularySchema, EMPTY_DOMAIN_VOCABULARY } from "@backed/core";
import type { DomainVocabulary } from "@backed/core";
import type { LanguageModel } from "ai";
import { EMPTY_BURST_USAGE, runBurst, type BurstResult, type BurstUsage } from "./burst.js";
import { withLlmCache, type LlmCacheContext } from "./llm-cache.js";
import { DISCOVERY_DOCUMENT_SAMPLE, DISCOVERY_LINES_PER_DOCUMENT, DISCOVERY_MAX_CHARS, LLM_SCHEMA_NAMES, } from "./constants.js";
import { resolveSemanticRequestTimeoutMs } from "./env.js";
import type { DocumentLineRow } from "./extract-document-mentions.js";
import { scanNameSuffixes, filterPlausibleSuffixes } from "./scan-name-suffixes.js";
export { DISCOVERY_DOCUMENT_SAMPLE, DISCOVERY_LINES_PER_DOCUMENT, DISCOVERY_MAX_CHARS, } from "./constants.js";
const DISCOVER_DOMAIN_SYSTEM_PROMPT = `You are a data modeller profiling an unfamiliar document corpus.

From the excerpts, derive the vocabulary needed to index this corpus. Report only what the excerpts support — never invent categories the text does not show.

- language: BCP-47 tag of the body text, e.g. "it", "en", "de"
- numberFormat: "decimal_comma" for 1.234,56, "decimal_point" for 1,234.56
- dateOrder: component order in written dates — "day_first" for 31/12/2026, "month_first" for 12/31/2026, "year_first" for 2026-12-31
- corpusSummary: one sentence on what these documents are and who issues them
- entityLabel: singular English noun for the named parties in the body text, e.g. "organization", "patient", "vendor", "counterparty"
- documentTopics: 4-12 subject areas that partition the corpus. Ids are lowercase English slugs; descriptions say when to assign the topic. Include a catch-all topic last.
- entitySectors: what kind of business or activity the named parties are in. Include a catch-all last.
- entityRoles: the function a named party plays in these documents, e.g. supplier, awardee, consultant. Include a catch-all last.
- factTypes: recurring quantities stated in the text. For each give the cue words that appear beside the number IN THE CORPUS LANGUAGE, the quantity kind, and how to aggregate several values. Mark isDefault on the one type that should claim bare amounts of its kind that carry no cue.
- identifierFormats: coded references (tender codes, registry numbers, case ids). cues are the labels printed before the code; charset and length bound the code itself.
- nameConventions.suffixes: EVERY token that ends a proper name in the excerpts — legal forms (SRL, SPA, SNC, SAS, GmbH, Inc, …), cooperative forms, etc. Lowercase, no dots. Include all distinct forms you see, not just one.
- nameConventions.leadingNoise: words that commonly precede such a name and are not part of it.

Use the corpus language for cues and suffixes, English for ids and descriptions.`;
function sampleCorpusText(rows: DocumentLineRow[]): string {
    const byDocument = new Map<string, string[]>();
    for (const row of rows) {
        const lines = byDocument.get(row.document_id) ?? [];
        if (lines.length < DISCOVERY_LINES_PER_DOCUMENT) {
            lines.push(row.text.trim());
        }
        byDocument.set(row.document_id, lines);
    }
    const entries = [...byDocument.entries()];
    const documents = entries.length <= DISCOVERY_DOCUMENT_SAMPLE
        ? entries
        : Array.from({ length: DISCOVERY_DOCUMENT_SAMPLE }, (_, index) => {
            const pick = Math.floor((index * entries.length) / DISCOVERY_DOCUMENT_SAMPLE);
            const entry = entries[pick];
            if (entry === undefined) {
                throw new Error(`document sample index ${String(pick)} is out of range`);
            }
            return entry;
        });
    return documents
        .map(([documentId, lines]) => [`### ${documentId}`, lines.filter((line) => line.length > 0).join("\n")].join("\n"))
        .join("\n\n")
        .slice(0, DISCOVERY_MAX_CHARS);
}
export interface DiscoverDomainOptions {
    model: LanguageModel;
    lines: DocumentLineRow[];
    onProgress?: (message: string) => void;
    llmCache?: LlmCacheContext;
}
export interface DiscoverDomainResult {
    vocabulary: DomainVocabulary;
    usage: BurstUsage;
    degraded: boolean;
}
export function buildFallbackDomainVocabulary(lines: DocumentLineRow[]): DomainVocabulary {
    const scannedSuffixes = scanNameSuffixes(lines);
    const suffixes = filterPlausibleSuffixes(scannedSuffixes);
    return DomainVocabularySchema.parse({
        ...EMPTY_DOMAIN_VOCABULARY,
        nameConventions: {
            suffixes,
            leadingNoise: [],
        },
    });
}
export async function discoverDomain(options: DiscoverDomainOptions): Promise<DiscoverDomainResult> {
    const sample = sampleCorpusText(options.lines);
    if (sample.trim().length === 0) {
        return { vocabulary: EMPTY_DOMAIN_VOCABULARY, usage: EMPTY_BURST_USAGE, degraded: false };
    }
    options.onProgress?.("Profiling corpus vocabulary via LLM...");
    let result: BurstResult<DomainVocabulary>;
    try {
        result = await runBurst({
            model: options.model,
            system: DISCOVER_DOMAIN_SYSTEM_PROMPT,
            prompt: `Corpus excerpts:\n\n${sample}`,
            schema: DomainVocabularySchema,
            schemaName: LLM_SCHEMA_NAMES.domainVocabulary,
            timeoutMs: resolveSemanticRequestTimeoutMs(),
            ...withLlmCache(options.llmCache),
            ...(options.onProgress !== undefined ? { onWaiting: options.onProgress } : {}),
        });
    }
    catch {
        options.onProgress?.("Vocabulary discovery failed — continuing with minimal defaults (deterministic extraction only)...");
        return {
            vocabulary: buildFallbackDomainVocabulary(options.lines),
            usage: EMPTY_BURST_USAGE,
            degraded: true,
        };
    }
    const scannedSuffixes = scanNameSuffixes(options.lines);
    const mergedSuffixes = filterPlausibleSuffixes([
        ...result.output.nameConventions.suffixes,
        ...scannedSuffixes,
    ]);
    const vocabulary = DomainVocabularySchema.parse({
        ...result.output,
        nameConventions: {
            ...result.output.nameConventions,
            suffixes: mergedSuffixes.length > 0 ? mergedSuffixes : scannedSuffixes,
        },
    });
    return { vocabulary, usage: result.usage, degraded: false };
}
export function mergeCorpusNameSuffixes(vocabulary: DomainVocabulary, lines: DocumentLineRow[]): DomainVocabulary {
    const scannedSuffixes = scanNameSuffixes(lines);
    const mergedSuffixes = filterPlausibleSuffixes([
        ...vocabulary.nameConventions.suffixes,
        ...scannedSuffixes,
    ]);
    return DomainVocabularySchema.parse({
        ...vocabulary,
        nameConventions: {
            ...vocabulary.nameConventions,
            suffixes: mergedSuffixes.length > 0
                ? mergedSuffixes
                : scannedSuffixes.length > 0
                    ? filterPlausibleSuffixes(scannedSuffixes)
                    : vocabulary.nameConventions.suffixes,
        },
    });
}
