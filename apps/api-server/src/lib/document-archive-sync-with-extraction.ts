import {
  applyFoundryExtractToCatalogWarehouse,
  createTenantArchiveFromEnv,
  listAllArchiveFiles,
  syncDocumentArchiveToWarehouse,
} from "@trybacked/infrastructure";
import {
  createGatewayLanguageModel,
  createOntologyExtractModelFromEnv,
  pdftotextAvailable,
  runArchiveFoundryExtract,
} from "@trybacked/ontology-extract";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

function splitArchivePath(relativePath: string): { folder: string | null; filename: string } {
  const normalized = relativePath.replace(/^\/+/, "");
  const slash = normalized.lastIndexOf("/");
  if (slash <= 0) {
    return { folder: null, filename: normalized };
  }
  const folder = normalized.slice(0, slash);
  const filename = normalized.slice(slash + 1);
  return { folder: folder.length > 0 ? folder : null, filename };
}

function isPdf(filename: string): boolean {
  return filename.toLowerCase().endsWith(".pdf");
}

export type RunDocumentArchiveSyncWithExtractionResult = {
  indexed: number;
  pdfsExtracted: number;
  entityRows: number;
  tokensUsed: number;
};

export async function runDocumentArchiveSyncWithExtraction(options: {
  env: NodeJS.ProcessEnv;
  tenantId: string;
  catalog: string;
  fullRefresh?: boolean | undefined;
  localeHint?: string | undefined;
}): Promise<RunDocumentArchiveSyncWithExtractionResult> {
  const syncOutcome = await syncDocumentArchiveToWarehouse({
    env: options.env,
    tenantId: options.tenantId,
    catalog: options.catalog,
    fullRefresh: options.fullRefresh === true,
  });

  const archive = createTenantArchiveFromEnv({
    env: options.env,
    tenantId: options.tenantId,
    catalog: options.catalog,
  });
  const files = await listAllArchiveFiles(archive);
  const pdfs = files
    .map((file) => {
      const { filename } = splitArchivePath(file.relativePath);
      return {
        documentId: file.documentId,
        relativePath: file.relativePath,
        filename,
      };
    })
    .filter((file) => isPdf(file.filename));

  if (pdfs.length === 0) {
    return {
      indexed: syncOutcome.indexed,
      pdfsExtracted: 0,
      entityRows: 0,
      tokensUsed: 0,
    };
  }

  if (!pdftotextAvailable()) {
    throw new Error(
      "Automatic document extraction requires pdftotext (install poppler-utils in the platform-api image).",
    );
  }

  const modelConfig = createOntologyExtractModelFromEnv(options.env);
  if (modelConfig === undefined) {
    throw new Error(
      "Automatic document extraction requires AI_GATEWAY_API_KEY on platform-api.",
    );
  }

  const tempDir = await mkdtemp(join(tmpdir(), "backed-doc-extract-"));
  try {
    const model = createGatewayLanguageModel(modelConfig.apiKey, modelConfig.modelId);
    const extracted = await runArchiveFoundryExtract({
      model,
      pdfs,
      tenantId: options.tenantId,
      catalog: options.catalog,
      localeHint: options.localeHint ?? "it",
      stagePdf: async (pdf) => {
        const absolutePath = join(tempDir, `${pdf.documentId}.pdf`);
        const bytes = await archive.read(pdf.relativePath);
        await writeFile(absolutePath, bytes);
        return absolutePath;
      },
    });
    const applied = await applyFoundryExtractToCatalogWarehouse({
      env: options.env,
      catalog: options.catalog,
      rows: extracted.rows,
      pageCountByDocumentId: extracted.pageCountByDocumentId,
    });
    return {
      indexed: syncOutcome.indexed,
      pdfsExtracted: pdfs.length,
      entityRows: applied.entityRows,
      tokensUsed: extracted.usage.totalTokens,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
