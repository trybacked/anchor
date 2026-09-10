import { DEFAULT_CHUNK_SEARCH_LIMIT } from "@backed/core";
import { readRowString } from "./duckdb-row.js";
import type { ChunkSearcher, DocumentCatalog, Entity, ModelSearchMatch, SemanticModel } from "@backed/core";

export type ModelSearchHit = ModelSearchMatch;
function slugifyDocumentTypeId(id: string): string {
    return id
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}
function buildDocumentSourceTableIndex(catalog: DocumentCatalog): Map<string, string> {
    const index = new Map<string, string>();
    for (const document of catalog.documents) {
        index.set(document.sourceTable, slugifyDocumentTypeId(document.documentType));
    }
    return index;
}
function resolveEntityForDocumentId(documentId: string, model: SemanticModel, sourceTableIndex: Map<string, string>): Entity | undefined {
    const directMatch = model.entities.find((entity) => entity.sourceTable === documentId);
    if (directMatch !== undefined) {
        return directMatch;
    }
    const typeEntityId = sourceTableIndex.get(documentId);
    if (typeEntityId !== undefined) {
        const typeEntity = model.entities.find((entity) => entity.id === typeEntityId);
        if (typeEntity !== undefined) {
            return typeEntity;
        }
    }
    return model.entities.find((entity) => entity.id === "document_chunk");
}
function snippetFromChunkText(text: string, maxLength = 160): string {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }
    return `${normalized.slice(0, maxLength - 1)}…`;
}
export async function searchModelViaDocumentChunks(model: SemanticModel, chunkSearch: ChunkSearcher, query: string, catalog: DocumentCatalog | undefined, limit: number = DEFAULT_CHUNK_SEARCH_LIMIT): Promise<ModelSearchHit[]> {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
        return [];
    }
    const chunkRows = await chunkSearch({
        query: trimmedQuery,
        mode: "hybrid",
        limit,
    });
    if (chunkRows.length === 0) {
        return [];
    }
    const sourceTableIndex = catalog !== undefined ? buildDocumentSourceTableIndex(catalog) : new Map<string, string>();
    const hits: ModelSearchHit[] = [];
    const seen = new Set<string>();
    for (const row of chunkRows) {
        const documentId = readRowString(row, "document_id");
        const chunkText = readRowString(row, "text");
        if (documentId.length === 0 || chunkText.length === 0) {
            continue;
        }
        const entity = resolveEntityForDocumentId(documentId, model, sourceTableIndex);
        if (entity === undefined) {
            continue;
        }
        const hitKey = `entity:${entity.id}`;
        if (seen.has(hitKey)) {
            continue;
        }
        seen.add(hitKey);
        hits.push({
            kind: "entity",
            id: entity.id,
            name: entity.name,
            snippet: snippetFromChunkText(chunkText),
        });
    }
    return hits;
}
