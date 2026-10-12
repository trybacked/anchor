import type { FoundryExtractOutput } from "./output.js";
import { foundryExtractToSeed, type FoundrySeedPayload } from "./seed.js";

export type ArchivePdfRecord = {
  documentId: string;
  relativePath: string;
  filename: string;
};

export function buildFoundrySeedFromArchive(
  output: FoundryExtractOutput,
  files: readonly ArchivePdfRecord[],
  options: { tenantId: string; catalog: string },
): FoundrySeedPayload {
  const fromExtract = foundryExtractToSeed(output, { ontologyId: options.tenantId });
  const documents = files.map((file) => ({
    document_id: file.documentId,
    source_file: file.relativePath,
    title: file.filename.replace(/\.pdf$/i, ""),
  }));
  return {
    ...fromExtract,
    catalog: options.catalog,
    schema: "docs",
    documents,
  };
}
