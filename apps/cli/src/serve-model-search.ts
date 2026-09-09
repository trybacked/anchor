import { existsSync } from "node:fs";
import { DocumentCatalogSchema, hasRunArtifact, listRunIds, readRunArtifact, workspacePaths, type DocumentCatalog, type SemanticModel } from "@backed/core";
import type { SearchMatch } from "@backed/mcp";
import { createChunkSearcher, documentChunksHaveEmbeddings, openDataSession, searchModelViaDocumentChunks } from "@backed/ingest";
import { embedQuery, resolveSemanticModels } from "@backed/semantic";

function findLatestRunWithDocuments(root: string): string | null {
    const runIds = listRunIds(root).reverse();
    return runIds.find((runId) => hasRunArtifact(root, runId, "documents")) ?? null;
}

function readDocumentCatalog(root: string): DocumentCatalog | undefined {
    const runId = findLatestRunWithDocuments(root);
    if (runId === null) {
        return undefined;
    }
    return readRunArtifact(root, runId, "documents", DocumentCatalogSchema);
}

export async function createServeSearchModelOptions(root: string, model: SemanticModel): Promise<{
    semanticSearch?: (query: string) => Promise<SearchMatch[]>;
} | undefined> {
    const { dataPath } = workspacePaths(root);
    if (!existsSync(dataPath)) {
        return undefined;
    }
    let models;
    try {
        models = resolveSemanticModels();
    }
    catch {
        return undefined;
    }
    const session = await openDataSession(dataPath);
    try {
        const embeddingsAvailable = await documentChunksHaveEmbeddings(session.query);
        if (!embeddingsAvailable) {
            return undefined;
        }
        const chunkSearch = createChunkSearcher(session.query, {
            embedQuery: (text) => embedQuery(models.embedding, text),
        });
        const catalog = readDocumentCatalog(root);
        return {
            semanticSearch: async (query) => searchModelViaDocumentChunks(model, chunkSearch, query, catalog),
        };
    }
    catch {
        return undefined;
    }
}
