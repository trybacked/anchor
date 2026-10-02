import type { SemanticChatAnswer } from "./engine.js";

export function renderAnswer(answer: SemanticChatAnswer): string {
  const { result, provenance } = answer;
  if (result.mode === "count") {
    const countRow = result.rows[0]?.["count"];
    const countValue = typeof countRow === "number" ? countRow : Number(countRow ?? 0);
    return `Found ${String(countValue)} records for object "${result.objectId}".`;
  }

  const lines: string[] = [
    `Results for "${result.objectId}": ${String(result.rowCount)} rows (query limit applied).`,
  ];
  if (result.rowCount > 0) {
    lines.push(`Columns: ${result.columns.join(", ")}.`);
  }

  const docCitations = provenance
    .map((row) => row.document)
    .filter((document): document is NonNullable<typeof document> => document !== undefined)
    .slice(0, 5)
    .map((document) => {
      const page =
        document.pageStart !== undefined
          ? ` page ${String(document.pageStart)}`
          : document.page !== undefined
            ? ` page ${String(document.page)}`
            : "";
      const label = document.filename ?? document.documentId;
      return `${label}${page}`;
    });
  if (docCitations.length > 0) {
    lines.push(`Cited documents: ${docCitations.join("; ")}.`);
  }

  return lines.join(" ");
}
