import type { SemanticAnswerClaim } from "./agent/types.js";

function excerpt(text: unknown, maxChars: number): string {
  if (typeof text !== "string" || text.length === 0) {
    return "";
  }
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars - 1)}…`;
}

export function renderDocumentSearchAnswer(options: {
  rows: readonly Record<string, unknown>[];
  locale?: string | undefined;
}): { answer: string; claims: SemanticAnswerClaim[] } {
  const italian = (options.locale ?? "it").toLowerCase().startsWith("it");
  if (options.rows.length === 0) {
    return {
      answer: italian
        ? "Non ho trovato passaggi negli archivi documenti indicizzati che corrispondano alla richiesta."
        : "No matching passages were found in the indexed document archive.",
      claims: [],
    };
  }
  const byFile = new Map<string, Record<string, unknown>>();
  for (const row of options.rows) {
    const filename = typeof row.filename === "string" ? row.filename : "documento";
    if (!byFile.has(filename)) {
      byFile.set(filename, row);
    }
  }
  const intro = italian
    ? `Ho trovato ${String(byFile.size)} documento/i negli archivi del tenant con contenuti pertinenti:`
    : `Found ${String(byFile.size)} relevant document(s) in the tenant archive:`;
  const bullets = [...byFile.entries()].slice(0, 5).map(([filename, row]) => {
    const folder = typeof row.folder === "string" && row.folder.length > 0 ? row.folder : null;
    const page = row.page;
    const pageLabel =
      typeof page === "number" ? (italian ? `, pagina ${String(page)}` : `, page ${String(page)}`) : "";
    const folderLabel = folder !== null ? (italian ? ` (cartella ${folder})` : ` (folder ${folder})`) : "";
    const snippet = excerpt(row.text, 220);
    return `- **${filename}**${folderLabel}${pageLabel}${snippet.length > 0 ? `: ${snippet}` : ""}`;
  });
  const answer = [intro, ...bullets].join("\n");
  return {
    answer,
    claims: [],
  };
}
