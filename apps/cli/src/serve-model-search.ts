import {
  createChunkSearcher,
  documentChunksHaveEmbeddings,
  openDataSession,
  searchModelViaDocumentChunks,
} from "@backed/ingest";
import type { SearchModelOptions } from "@backed/mcp";
import { embedQuery, resolveSemanticModels } from "@backed/semantic";
import {
  DocumentCatalogSchema,
  hasRunArtifact,
  listRunIds,
  readRunArtifact,
  workspacePaths,
  type DocumentCatalog,
  type SemanticModel,
} from "@trybacked/core";
import { existsSync } from "node:fs";

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

export async function createServeSearchModelOptions(
  root: string,
  model: SemanticModel,
): Promise<SearchModelOptions | undefined> {
  const { dataPath } = workspacePaths(root);
  if (!existsSync(dataPath)) {
    return undefined;
  }
  let models;
  try {
    models = resolveSemanticModels();
  } catch {
    return undefined;
  }
  const session = await openDataSession(dataPath);
  let keepSessionOpen = false;
  try {
    const embeddingsAvailable = await documentChunksHaveEmbeddings(session.query);
    if (!embeddingsAvailable) {
      return undefined;
    }
    const chunkSearch = createChunkSearcher(session.query, {
      embedQuery: (text) => embedQuery(models.embedding, text),
    });
    const catalog = readDocumentCatalog(root);
    keepSessionOpen = true;
    return {
      semanticSearch: async (query) =>
        searchModelViaDocumentChunks(model, chunkSearch, query, catalog),
      dispose: () => {
        session.close();
      },
    };
  } catch {
    return undefined;
  } finally {
    if (!keepSessionOpen) {
      session.close();
    }
  }
}
