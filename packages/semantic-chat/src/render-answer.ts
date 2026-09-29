import type { SemanticChatAnswer } from "./engine.js";

export function renderAnswer(answer: SemanticChatAnswer): string {
  const { result, provenance } = answer;
  if (result.mode === "count") {
    const countRow = result.rows[0]?.["count"];
    const countValue = typeof countRow === "number" ? countRow : Number(countRow ?? 0);
    return `Trovati ${String(countValue)} record per l'oggetto "${result.objectId}".`;
  }

  const lines: string[] = [
    `Risultati per "${result.objectId}": ${String(result.rowCount)} righe (limite query applicato).`,
  ];
  if (result.rowCount > 0) {
    lines.push(`Colonne: ${result.columns.join(", ")}.`);
  }

  const docCitations = provenance
    .map((row) => row.document)
    .filter((document): document is NonNullable<typeof document> => document !== undefined)
    .slice(0, 5)
    .map((document) => {
      const page =
        document.pageStart !== undefined
          ? ` p. ${String(document.pageStart)}`
          : document.page !== undefined
            ? ` p. ${String(document.page)}`
            : "";
      const label = document.filename ?? document.documentId;
      return `${label}${page}`;
    });
  if (docCitations.length > 0) {
    lines.push(`Documenti citati: ${docCitations.join("; ")}.`);
  }

  return lines.join(" ");
}
