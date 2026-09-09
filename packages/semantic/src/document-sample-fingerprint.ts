import { createHash } from "node:crypto";
import type { DocumentExtractionSample } from "./extract-document-catalog.js";
import { filterHeaderLinesForLlm, normalizeLine } from "./extract-header-fields.js";

export function hashDocumentSample(sample: DocumentExtractionSample, recurringLines: Set<string> = new Set()): string {
    const payload = [
        sample.sourceTable,
        String(sample.pageCount),
        filterHeaderLinesForLlm(sample.headerLines, recurringLines).map(normalizeLine).join("\n"),
    ].join("\0");
    return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
