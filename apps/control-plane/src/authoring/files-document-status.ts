import type { DatasetProvider } from "@trybacked/core";

export async function listFileSourceDocumentStatus(provider: DatasetProvider): Promise<{
  ok: true;
  collections: Array<{ id: string; fileCount: number }>;
}> {
  const datasets = await provider.listDatasets();
  const collections: Array<{ id: string; fileCount: number }> = [];
  for (const dataset of datasets) {
    const metadata = await provider.getMetadata(dataset);
    collections.push({ id: dataset.id, fileCount: metadata.rowCount ?? 0 });
  }
  return { ok: true, collections };
}
