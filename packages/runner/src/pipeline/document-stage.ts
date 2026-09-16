import {
    DocumentCatalogSchema,
    DomainVocabularySchema,
    enrichmentFieldValues,
    hasEnrichmentFieldValues,
    mergeVocabulary,
    readRunArtifact,
    writeRunArtifact,
} from "@backed/core";
import type { DocumentCatalog, DomainVocabulary, WorkspaceConfig } from "@backed/core";
import type { IngestSession } from "@backed/ingest";
import {
    applyDocumentFields,
    chunkDocumentLines,
    fetchAllDocumentLines,
    fetchChunkTextsForEmbedding,
    fetchCorpusSampleLines,
    fetchDocumentHeaderSamples,
    materializeDocumentMentions,
    materializeDocumentTables,
    materializeEntityProfiles,
    materializeFacts,
    storeChunkEmbeddings,
} from "@backed/ingest";
import {
    buildDocumentTopicSamples,
    buildEntityIndex,
    discoverDomain,
    embedTexts,
    EMPTY_BURST_USAGE,
    enrichDocuments,
    enrichEntities,
    ensureCurrencyFactTypes,
    extractDocumentCatalog,
    extractFactsFromLines,
    extractMentionsFromLines,
    mergeCorpusNameSuffixes,
    sumBurstUsage,
    toMaterializedMentions,
} from "@backed/semantic";
import { buildDocumentTypeRegistry } from "../tenant-persist-cache.js";
import type { BurstUsage, CompressedTable, DocumentCatalogCacheEntry, LlmCacheContext, SemanticModels } from "@backed/semantic";
import { CORPUS_SAMPLE_LINES_PER_TABLE } from "../config.js";
import type { PipelineProgressReporter } from "../progress.js";
import {
    filterLineRowsByDocumentIds,
    mergeEnrichedDocuments,
    resolveNewDocumentSourceTables,
} from "./document-incremental.js";
import { PIPELINE_DATASET_TABLES } from "./setup.js";

export interface DocumentStageResult {
    documentCatalog: DocumentCatalog;
    vocabulary: DomainVocabulary;
    extractionUsage: BurstUsage;
    extractionMs: number;
    embedMs: number;
}

async function embedDocumentChunks(
    session: IngestSession,
    models: SemanticModels,
    chunked: Awaited<ReturnType<typeof chunkDocumentLines>>,
    progress: PipelineProgressReporter,
): Promise<number> {
    const chunkTexts = await fetchChunkTextsForEmbedding(session.query);
    if (chunkTexts.length === 0) {
        if (chunked.embeddingsRestored > 0) {
            progress.success(`Semantic search ready (${String(chunked.embeddingsRestored)} vectors preserved)`);
        }
        return 0;
    }
    const embedStarted = Date.now();
    const embedded = await embedTexts(models.embedding, chunkTexts.map((row) => row.text), (message) => {
        progress.detail(message);
    }, ({ completed, total }) => {
        progress.track?.("Embedding document chunks", completed, total);
    });
    await storeChunkEmbeddings(session.query, chunkTexts.map((row, index) => ({
        document_id: row.document_id,
        chunk_index: row.chunk_index,
        embedding: embedded.embeddings[index] ?? [],
    })));
    progress.success(`Semantic search ready (${String(chunkTexts.length)} vectors)`);
    return Date.now() - embedStarted;
}

async function resolveVocabulary(
    session: IngestSession,
    models: SemanticModels,
    runId: string,
    root: string,
    lineDocuments: CompressedTable[],
    configured: WorkspaceConfig["domain"],
    progress: PipelineProgressReporter,
    previousRunId: string | undefined,
    forceFull: boolean,
    llmCache: LlmCacheContext,
    persistedVocabulary: DomainVocabulary | undefined,
): Promise<{ vocabulary: DomainVocabulary; usage: BurstUsage }> {
    if (!forceFull && persistedVocabulary !== undefined) {
        const vocabulary = mergeVocabulary(persistedVocabulary, configured);
        progress.detail("Reusing vocabulary from tenant cache...");
        progress.step(`Domain vocabulary reused (${vocabulary.entityLabel})`);
        return { vocabulary, usage: EMPTY_BURST_USAGE };
    }
    if (!forceFull && previousRunId !== undefined) {
        try {
            const cached = readRunArtifact(root, previousRunId, "vocabulary", DomainVocabularySchema);
            const vocabulary = mergeVocabulary(cached, configured);
            progress.detail("Reusing vocabulary from previous run...");
            progress.step(`Domain vocabulary reused (${vocabulary.entityLabel})`);
            return { vocabulary, usage: EMPTY_BURST_USAGE };
        }
        catch {
            // fall through
        }
    }
    const sampleLines = await fetchCorpusSampleLines(session.query, lineDocuments.map((table) => table.table), CORPUS_SAMPLE_LINES_PER_TABLE);
    const discovered = await discoverDomain({
        model: models.language,
        lines: sampleLines,
        onProgress: (message) => {
            progress.detail(message);
        },
        llmCache,
    });
    const vocabulary = mergeVocabulary(discovered.vocabulary, configured);
    writeRunArtifact(root, runId, "vocabulary", vocabulary);
    if (discovered.degraded) {
        progress.warn("Domain vocabulary degraded to defaults.");
    }
    progress.step(`Domain vocabulary ready (${vocabulary.entityLabel})`);
    return { vocabulary, usage: discovered.usage };
}

function catalogToCache(catalog: DocumentCatalog): Map<string, DocumentCatalogCacheEntry> | undefined {
    const cache = new Map<string, DocumentCatalogCacheEntry>();
    for (const entry of catalog.documents) {
        if (entry.headerFingerprint === undefined) {
            continue;
        }
        cache.set(entry.sourceTable, {
            entry,
            headerFingerprint: entry.headerFingerprint,
        });
    }
    return cache.size > 0 ? cache : undefined;
}

function loadDocumentCatalogCache(
    root: string,
    previousRunId: string | undefined,
    forceFull: boolean,
    persistedDocumentCatalog: DocumentCatalog | undefined,
): Map<string, DocumentCatalogCacheEntry> | undefined {
    if (forceFull) {
        return undefined;
    }
    if (persistedDocumentCatalog !== undefined) {
        return catalogToCache(persistedDocumentCatalog);
    }
    if (previousRunId === undefined) {
        return undefined;
    }
    try {
        const catalog = readRunArtifact(root, previousRunId, "documents", DocumentCatalogSchema);
        return catalogToCache(catalog);
    }
    catch {
        return undefined;
    }
}

export async function runDocumentStage(
    session: IngestSession,
    models: SemanticModels,
    runId: string,
    root: string,
    lineDocuments: CompressedTable[],
    workspaceConfig: WorkspaceConfig,
    skipEmbed: boolean,
    previousRunId: string | undefined,
    forceFull: boolean,
    llmCache: LlmCacheContext,
    progress: PipelineProgressReporter,
    persistedVocabulary: DomainVocabulary | undefined,
    persistedDocumentCatalog: DocumentCatalog | undefined,
    unknownSourceFiles: string[] | undefined,
): Promise<DocumentStageResult> {
    progress.step(`Documents (${String(lineDocuments.length)} file(s))`);
    const extractionStarted = Date.now();
    const headerSamples = await fetchDocumentHeaderSamples(session.query, lineDocuments.map((table) => ({
        sourceTable: table.table,
        pageCount: table.rowCount,
    })));
    const catalogCache = loadDocumentCatalogCache(root, previousRunId, forceFull, persistedDocumentCatalog);
    const typeRegistry = forceFull || persistedDocumentCatalog === undefined
        ? undefined
        : buildDocumentTypeRegistry(persistedDocumentCatalog);
    const vocabularyPromise = resolveVocabulary(
        session,
        models,
        runId,
        root,
        lineDocuments,
        workspaceConfig.domain,
        progress,
        previousRunId,
        forceFull,
        llmCache,
        persistedVocabulary,
    );
    const extractedPromise = extractDocumentCatalog({
        runId,
        models,
        samples: headerSamples,
        documentTypeHints: workspaceConfig.documentTypeHints,
        vocabulary: vocabularyPromise.then((result) => result.vocabulary),
        llmCache,
        ...(catalogCache !== undefined ? { catalogCache } : {}),
        ...(typeRegistry !== undefined ? { typeRegistry } : {}),
        onProgress: (message) => {
            progress.detail(message);
        },
        onLlmProgress: ({ completed, total }) => {
            progress.track?.("Classifying documents (LLM)", completed, total);
        },
    });
    const [{ vocabulary: initialVocabulary, usage: vocabularyUsage }, extracted] = await Promise.all([
        vocabularyPromise,
        extractedPromise,
    ]);
    let vocabulary = initialVocabulary;
    writeRunArtifact(root, runId, "vocabulary", vocabulary);
    const extractionMs = Date.now() - extractionStarted;
    const sourceFileByTable = new Map(session.datasets.map((dataset) => [dataset.tableName, dataset.sourceFile]));
    const materialized = await materializeDocumentTables(session.query, extracted.catalog, sourceFileByTable);
    session.datasets = session.datasets.filter((dataset) => !materialized.datasetsRemoved.includes(dataset.tableName));
    session.datasets.push(...materialized.datasetsAdded);
    const lineRows = await fetchAllDocumentLines(session.query);
    vocabulary = mergeCorpusNameSuffixes(vocabulary, lineRows);
    vocabulary = ensureCurrencyFactTypes(vocabulary, lineRows);
    writeRunArtifact(root, runId, "vocabulary", vocabulary);
    const newDocumentSourceTables = resolveNewDocumentSourceTables(
        materialized.catalog.documents,
        unknownSourceFiles,
        persistedDocumentCatalog,
    );
    const documentsToEnrich = materialized.catalog.documents.filter((document) => newDocumentSourceTables.has(document.sourceTable));
    let enrichUsage: BurstUsage = EMPTY_BURST_USAGE;
    let enrichedDocumentEntries = materialized.catalog.documents;
    if (documentsToEnrich.length > 0) {
        const enrichedDocuments = await enrichDocuments({
            model: models.language,
            documents: documentsToEnrich,
            sampleByDocument: buildDocumentTopicSamples(lineRows),
            vocabulary,
            llmCache,
            onProgress: (message) => {
                progress.detail(message);
            },
            onBatchProgress: ({ completed, total }) => {
                progress.track?.("Tagging documents (LLM)", completed, total);
            },
        });
        enrichUsage = enrichedDocuments.usage;
        enrichedDocumentEntries = mergeEnrichedDocuments(materialized.catalog.documents, enrichedDocuments.documents);
    }
    else if (unknownSourceFiles !== undefined && unknownSourceFiles.length > 0) {
        progress.detail("Reusing document enrichment from tenant cache");
    }
    const tableByDocumentType = new Map(materialized.catalog.documentTypes.map((type) => [type.id, type.tableName]));
    await applyDocumentFields(session.query, enrichedDocumentEntries.flatMap((document) => {
        const tableName = tableByDocumentType.get(document.documentType);
        const fields = enrichmentFieldValues(document);
        return tableName === undefined || !hasEnrichmentFieldValues(fields)
            ? []
            : [{
                documentId: document.sourceTable,
                tableName,
                fields,
            }];
    }));
    const documentCatalog = {
        ...materialized.catalog,
        documents: enrichedDocumentEntries,
    };
    const incrementalLineRows = filterLineRowsByDocumentIds(lineRows, newDocumentSourceTables);
    const rawMentions = extractMentionsFromLines(incrementalLineRows, vocabulary);
    let entityIndex = buildEntityIndex(rawMentions);
    let entityEnrichUsage: BurstUsage = EMPTY_BURST_USAGE;
    if (entityIndex.size > 0) {
        const enriched = await enrichEntities({
            model: models.language,
            entities: entityIndex,
            mentions: rawMentions,
            vocabulary,
            llmCache,
            onProgress: (message) => {
                progress.detail(message);
            },
        });
        entityIndex = enriched.entities;
        entityEnrichUsage = enriched.usage;
    }
    else if (unknownSourceFiles !== undefined && unknownSourceFiles.length > 0) {
        progress.detail("Skipping entity enrichment — no new document mentions");
    }
    const materializedMentions = await materializeDocumentMentions(session.query, {
        mentions: toMaterializedMentions(rawMentions, entityIndex),
        entities: [...entityIndex.values()],
    });
    session.datasets = session.datasets.filter((dataset) => !PIPELINE_DATASET_TABLES.has(dataset.tableName));
    session.datasets.push(...materializedMentions.datasetsAdded);
    const materializedFacts = await materializeFacts(session.query, extractFactsFromLines(lineRows, rawMentions, vocabulary));
    session.datasets.push(...materializedFacts.datasetsAdded);
    const materializedProfiles = await materializeEntityProfiles(session.query, {
        factTypes: vocabulary.factTypes,
    });
    session.datasets.push(...materializedProfiles.datasetsAdded);
    writeRunArtifact(root, runId, "documents", documentCatalog);
    const chunked = await chunkDocumentLines(session.query);
    session.datasets = session.datasets.filter((dataset) => dataset.tableName !== chunked.dataset.tableName);
    session.datasets.push(chunked.dataset);
    let embedMs = 0;
    if (!skipEmbed) {
        embedMs = await embedDocumentChunks(session, models, chunked, progress);
    }
    else {
        progress.warn("Embeddings skipped");
    }
    return {
        documentCatalog,
        vocabulary,
        extractionUsage: sumBurstUsage(vocabularyUsage, extracted.usage, enrichUsage, entityEnrichUsage),
        extractionMs,
        embedMs,
    };
}
