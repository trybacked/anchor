import type { RowProvenance } from "@trybacked/service";
export type { DocumentProvenance, EntityProvenance, RowProvenance } from "@trybacked/service";
export { buildQueryExecutionProvenance, buildRowProvenance } from "@trybacked/service";
export async function attachEvidenceToProvenance(options: {
  provenance: RowProvenance[];
  rows: Record<string, unknown>[];
  chunkSearch: (input: { query: string; limit?: number }) => Promise<Record<string, unknown>[]>;
}): Promise<RowProvenance[]> {
  const enriched: RowProvenance[] = [];
  for (const row of options.provenance) {
    const textValues = Object.values(row.row)
      .filter(
        (value): value is string =>
          typeof value === "string" && value.length >= 4 && !/^\d+$/.test(value.trim()),
      )
      .slice(0, 2);
    if (textValues.length === 0) {
      enriched.push(row);
      continue;
    }
    const chunks = await options.chunkSearch({ query: textValues[0] ?? "", limit: 3 });
    const top = chunks[0];
    if (top === undefined) {
      enriched.push(row);
      continue;
    }
    const documentId = top["documentId"];
    const page = top["page"];
    const documentIdValue =
      typeof documentId === "string"
        ? documentId
        : typeof documentId === "number" || typeof documentId === "bigint"
          ? documentId.toString()
          : "";
    enriched.push({
      ...row,
      document: {
        documentId: documentIdValue,
        ...(typeof page === "number" ? { page, pageStart: page } : {}),
        ...(typeof top["filename"] === "string"
          ? { filename: top["filename"], sourceFile: top["filename"] }
          : {}),
      },
    });
  }
  return enriched;
}
