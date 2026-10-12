import type { DocumentParser, ParsedDocument } from "@trybacked/ports";

type DoclingResponse = {
  document?: { md_content?: string; text_content?: string; filename?: string };
};

function documentFromPlainText(
  uri: string,
  mimeType: string,
  plainText: string,
  title?: string,
): ParsedDocument {
  const lines = plainText.split(/\r?\n/);
  let offset = 0;
  const blocks = lines.map((line) => {
    const text = line.trimEnd();
    const charStart = offset;
    offset += line.length + 1;
    return {
      kind: "paragraph" as const,
      text,
      charStart,
      charEnd: charStart + text.length,
    };
  });
  return {
    uri,
    mimeType,
    ...(title !== undefined ? { title } : {}),
    blocks,
    tables: [],
    plainText,
  };
}

/** Optional Docling sidecar (2304.02711 family): layout-aware parsing for PDF/Office. */
export function createDoclingDocumentParser(baseUrl: string): DocumentParser {
  const normalized = baseUrl.replace(/\/$/, "");
  return {
    supportedMimeTypes: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ],
    async parse(input): Promise<ParsedDocument> {
      const form = new FormData();
      const blob = new Blob([input.bytes], { type: input.mimeType });
      form.append("files", blob, input.uri);
      const response = await fetch(`${normalized}/v1/convert/file`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        throw new Error(`Docling HTTP ${String(response.status)}: ${await response.text()}`);
      }
      const payload = (await response.json()) as DoclingResponse;
      const plainText =
        payload.document?.text_content?.trim() || payload.document?.md_content?.trim() || "";
      return documentFromPlainText(
        input.uri,
        input.mimeType,
        plainText,
        payload.document?.filename ?? input.uri,
      );
    },
  };
}
