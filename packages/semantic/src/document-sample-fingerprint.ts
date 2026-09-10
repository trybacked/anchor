import { createHash } from "node:crypto";
import type { DocumentExtractionSample } from "./extract-document-catalog.js";
import { filterHeaderLinesForLlm, normalizeLine } from "./extract-header-fields.js";

function hashPayload(payload: string): string {
    return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export function hashHeaderContent(headerLines: string[], recurringLines: Set<string> = new Set()): string {
    const payload = filterHeaderLinesForLlm(headerLines, recurringLines).map(normalizeLine).join("\n");
    return hashPayload(payload);
}

export function hashDocumentSample(sample: DocumentExtractionSample, recurringLines: Set<string> = new Set()): string {
    const payload = [
        sample.sourceTable,
        String(sample.pageCount),
        filterHeaderLinesForLlm(sample.headerLines, recurringLines).map(normalizeLine).join("\n"),
    ].join("\0");
    return hashPayload(payload);
}
