import type { LanguageModel } from "ai";
import {
  collectPdfExcerptsFromPaths,
  pdfPageCount,
  type CollectPdfExcerptsOptions,
} from "./collect-excerpts.js";
import { extractFoundryInstancesFromExcerpts } from "./extract-instances.js";
import type { FoundryExtractOutput } from "./output.js";
import { buildFoundrySeedFromArchive, type ArchivePdfRecord } from "./archive-seed.js";
import type { FoundrySeedPayload } from "./seed.js";
import { buildFoundryTableRows } from "./materialize-rows.js";
import type { FoundryMaterializeTableRows } from "./materialize-rows.js";

export type RunArchiveFoundryExtractOptions = {
  model: LanguageModel;
  pdfs: readonly ArchivePdfRecord[];
  stagePdf: (pdf: ArchivePdfRecord) => Promise<string>;
  tenantId: string;
  catalog: string;
  localeHint?: string | undefined;
  excerptOptions?: Omit<CollectPdfExcerptsOptions, "root">;
};

export type RunArchiveFoundryExtractResult = {
  output: FoundryExtractOutput;
  seed: FoundrySeedPayload;
  rows: FoundryMaterializeTableRows;
  pageCountByDocumentId: Record<string, number>;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
};

function isPdf(filename: string): boolean {
  return filename.toLowerCase().endsWith(".pdf");
}

export async function runArchiveFoundryExtract(
  options: RunArchiveFoundryExtractOptions,
): Promise<RunArchiveFoundryExtractResult> {
  const pdfs = options.pdfs.filter((pdf) => isPdf(pdf.filename));
  if (pdfs.length === 0) {
    throw new Error("No PDF files in archive for extraction.");
  }

  const paths: { label: string; absolutePath: string; documentId: string }[] = [];
  const pageCountByDocumentId: Record<string, number> = {};

  for (const pdf of pdfs) {
    const absolutePath = await options.stagePdf(pdf);
    paths.push({ label: pdf.relativePath, absolutePath, documentId: pdf.documentId });
    pageCountByDocumentId[pdf.documentId] = pdfPageCount(absolutePath);
  }

  const documents = collectPdfExcerptsFromPaths(
    paths.map((entry) => ({ label: entry.label, absolutePath: entry.absolutePath })),
    options.excerptOptions,
  );
  const extracted = await extractFoundryInstancesFromExcerpts({
    model: options.model,
    documents,
    localeHint: options.localeHint,
  });
  const output =
    extracted.output.instances.length > 0
      ? extracted.output
      : {
          ...extracted.output,
          instances: pdfs.map((pdf) => ({
            objectTypeId: "document" as const,
            name: pdf.filename.replace(/\.pdf$/i, "") || pdf.filename,
            sourceFiles: [pdf.relativePath],
            evidence: "Documento catalogato in archivio (fallback estrattore).",
          })),
        };
  const seed = buildFoundrySeedFromArchive(output, pdfs, {
    tenantId: options.tenantId,
    catalog: options.catalog,
  });
  const rows = buildFoundryTableRows(output, seed);
  return {
    output,
    seed,
    rows,
    pageCountByDocumentId,
    usage: extracted.usage,
  };
}
