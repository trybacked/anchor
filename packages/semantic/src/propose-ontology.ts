import type { DocumentCatalog, Doubt } from "@backed/core";
import { EMPTY_BURST_USAGE, runBurst, sumBurstUsage } from "./burst.js";
import type { BurstUsage } from "./burst.js";
import { withLlmCache, type LlmCacheContext } from "./llm-cache.js";
import {
    LLM_SCHEMA_NAMES,
    ONTOLOGY_SPLIT_DOCUMENT_TYPE_THRESHOLD,
    ONTOLOGY_SPLIT_TABLE_THRESHOLD,
} from "./constants.js";
import type { CompressedTable } from "./compress.js";
import type { SemanticModels } from "./env.js";
import {
    OntologyEntitiesOutputSchema,
    OntologyOutputSchema,
    OntologyRelationsOutputSchema,
} from "./llm-output.js";
import type { ColumnClassificationOutput, OntologyOutput } from "./llm-output.js";
import {
    ONTOLOGY_SYSTEM_PROMPT,
    ontologyEntitiesPrompt,
    ontologyPrompt,
    ontologyRelationsPrompt,
} from "./prompts.js";
import { isDocumentCorpus } from "./line-document.js";
import { isDocumentPipelineTable, type TableRouting } from "./table-routing.js";
import { droppedDoubt } from "./propose-assembly.js";

export type OntologyStrategy =
    | {
          kind: "llm-with-catalog";
          tables: CompressedTable[];
          catalog: DocumentCatalog;
      }
    | {
          kind: "deterministic-catalog";
          catalog: DocumentCatalog;
      }
    | {
          kind: "deterministic-corpus";
          lineDocumentCount: number;
      }
    | {
          kind: "llm-full";
          tables: CompressedTable[];
      };

export interface OntologyRunResult {
    output: OntologyOutput;
    usage: BurstUsage;
    extraDoubts: Doubt[];
}

export function filterDocumentEntitiesFromOntology(ontology: OntologyOutput): {
    ontology: OntologyOutput;
    doubts: Doubt[];
} {
    const doubts: Doubt[] = [];
    const entities = ontology.entities.filter((candidate) => {
        if (!isDocumentPipelineTable(candidate.sourceTable)) {
            return true;
        }
        doubts.push(
            droppedDoubt(
                `entity ${candidate.id}`,
                `LLM proposed document entity "${candidate.name}" on table "${candidate.sourceTable}" — document entities are built deterministically.`,
                "Proposal dropped: duplicate document entity from LLM.",
            ),
        );
        return false;
    });
    return { ontology: { ...ontology, entities }, doubts };
}

export function classificationForTables(
    classification: ColumnClassificationOutput,
    tables: CompressedTable[],
): ColumnClassificationOutput {
    const tableNames = new Set(tables.map((table) => table.table));
    return {
        tables: classification.tables.filter((table) => tableNames.has(table.table)),
    };
}

export function shouldSplitOntologyBurst(tables: CompressedTable[], documentCatalog?: DocumentCatalog): boolean {
    const documentTypeCount = documentCatalog?.documentTypes.length ?? 0;
    return tables.length >= ONTOLOGY_SPLIT_TABLE_THRESHOLD
        || documentTypeCount >= ONTOLOGY_SPLIT_DOCUMENT_TYPE_THRESHOLD;
}

async function runOntologyBurst(
    models: SemanticModels,
    timeoutMs: number,
    system: string,
    prompt: string,
    llmCache: LlmCacheContext | undefined,
    onProgress?: (message: string) => void,
): Promise<{
    output: OntologyOutput;
    usage: BurstUsage;
}> {
    onProgress?.("Ontology proposal...");
    const result = await runBurst({
        model: models.language,
        system,
        prompt,
        schema: OntologyOutputSchema,
        schemaName: LLM_SCHEMA_NAMES.ontologyProposal,
        timeoutMs,
        ...withLlmCache(llmCache),
        ...(onProgress !== undefined
            ? {
                  onWaiting: () => {
                      onProgress("Building ontology (LLM)…");
                  },
              }
            : {}),
    });
    return result;
}

async function runSplitOntologyBurst(
    models: SemanticModels,
    timeoutMs: number,
    tables: CompressedTable[],
    classification: ColumnClassificationOutput,
    documentCatalog: DocumentCatalog | undefined,
    llmCache: LlmCacheContext | undefined,
    onProgress?: (message: string) => void,
): Promise<{
    output: OntologyOutput;
    usage: BurstUsage;
}> {
    onProgress?.("Ontology entities (split pass 1/2)...");
    const entitiesResult = await runBurst({
        model: models.language,
        system: ONTOLOGY_SYSTEM_PROMPT,
        prompt: ontologyEntitiesPrompt(tables, classification, documentCatalog),
        schema: OntologyEntitiesOutputSchema,
        schemaName: LLM_SCHEMA_NAMES.ontologyEntities,
        timeoutMs,
        ...withLlmCache(llmCache),
        ...(onProgress !== undefined
            ? {
                  onWaiting: () => {
                      onProgress("Building ontology entities (LLM)…");
                  },
              }
            : {}),
    });
    onProgress?.("Ontology relations (split pass 2/2)...");
    const relationsResult = await runBurst({
        model: models.language,
        system: ONTOLOGY_SYSTEM_PROMPT,
        prompt: ontologyRelationsPrompt(tables, classification, entitiesResult.output.entities, documentCatalog),
        schema: OntologyRelationsOutputSchema,
        schemaName: LLM_SCHEMA_NAMES.ontologyRelations,
        timeoutMs,
        ...withLlmCache(llmCache),
        ...(onProgress !== undefined
            ? {
                  onWaiting: () => {
                      onProgress("Building ontology relations (LLM)…");
                  },
              }
            : {}),
    });
    return {
        output: {
            entities: entitiesResult.output.entities,
            relations: relationsResult.output.relations,
            rules: relationsResult.output.rules,
            doubts: [...entitiesResult.output.doubts, ...relationsResult.output.doubts],
        },
        usage: sumBurstUsage(entitiesResult.usage, relationsResult.usage),
    };
}

async function runOntologyForTables(
    models: SemanticModels,
    timeoutMs: number,
    tables: CompressedTable[],
    classification: ColumnClassificationOutput,
    documentCatalog: DocumentCatalog | undefined,
    llmCache: LlmCacheContext | undefined,
    onProgress?: (message: string) => void,
): Promise<{
    output: OntologyOutput;
    usage: BurstUsage;
}> {
    const scopedClassification = classificationForTables(classification, tables);
    if (shouldSplitOntologyBurst(tables, documentCatalog)) {
        return runSplitOntologyBurst(
            models,
            timeoutMs,
            tables,
            scopedClassification,
            documentCatalog,
            llmCache,
            onProgress,
        );
    }
    return runOntologyBurst(
        models,
        timeoutMs,
        ONTOLOGY_SYSTEM_PROMPT,
        ontologyPrompt(tables, scopedClassification, documentCatalog),
        llmCache,
        onProgress,
    );
}

export function resolveOntologyStrategy(
    routing: TableRouting,
    documentCatalog: DocumentCatalog | undefined,
): OntologyStrategy {
    const documentCorpus =
        documentCatalog !== undefined ||
        isDocumentCorpus(routing.lineDocuments.length, routing.totalTableCount);
    if (documentCatalog !== undefined && routing.llmStructured.length > 0) {
        return {
            kind: "llm-with-catalog",
            tables: routing.llmStructured,
            catalog: documentCatalog,
        };
    }
    if (documentCatalog !== undefined) {
        return { kind: "deterministic-catalog", catalog: documentCatalog };
    }
    if (routing.businessStructured.length === 0 && documentCorpus) {
        return { kind: "deterministic-corpus", lineDocumentCount: routing.lineDocuments.length };
    }
    return { kind: "llm-full", tables: routing.allTables };
}

export async function runOntologyStrategy(
    strategy: OntologyStrategy,
    models: SemanticModels,
    classification: ColumnClassificationOutput,
    timeoutMs: number,
    llmCache: LlmCacheContext | undefined,
    onProgress?: (message: string) => void,
): Promise<OntologyRunResult> {
    switch (strategy.kind) {
        case "llm-with-catalog": {
            onProgress?.("Ontology proposal for structured tables alongside document catalog...");
            const ontology = await runOntologyForTables(
                models,
                timeoutMs,
                strategy.tables,
                classification,
                strategy.catalog,
                llmCache,
                onProgress,
            );
            const filtered = filterDocumentEntitiesFromOntology(ontology.output);
            return {
                output: filtered.ontology,
                usage: ontology.usage,
                extraDoubts: filtered.doubts,
            };
        }
        case "deterministic-catalog": {
            onProgress?.("Building typed document ontology (deterministic entities and relations).");
            return {
                output: { entities: [], relations: [], rules: [], doubts: [] },
                usage: EMPTY_BURST_USAGE,
                extraDoubts: [],
            };
        }
        case "deterministic-corpus": {
            onProgress?.("Document corpus only — skipping ontology LLM (deterministic entities per source file).");
            return {
                output: {
                    entities: [],
                    relations: [],
                    rules: [],
                    doubts: [
                        {
                            topic: "document corpus",
                            question: `How should ${String(strategy.lineDocumentCount)} source documents be grouped into business entity types?`,
                            reason: "Each line-document table is one extracted file (page/line/text). One entity per file was created deterministically; regroup by document type during review.",
                        },
                    ],
                },
                usage: EMPTY_BURST_USAGE,
                extraDoubts: [],
            };
        }
        case "llm-full": {
            const ontology = await runOntologyForTables(
                models,
                timeoutMs,
                strategy.tables,
                classification,
                undefined,
                llmCache,
                onProgress,
            );
            return {
                output: ontology.output,
                usage: ontology.usage,
                extraDoubts: [],
            };
        }
        default: {
            const _exhaustive: never = strategy;
            throw new Error(`Unhandled ontology strategy: ${String(_exhaustive)}`);
        }
    }
}
