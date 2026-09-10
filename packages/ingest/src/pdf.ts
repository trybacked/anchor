import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { LineRow } from "./line-table.js";

export async function extractPdfLines(absolutePath: string): Promise<LineRow[]> {
    const data = new Uint8Array(await readFile(absolutePath));
    const document = await getDocument({ data, useSystemFonts: true }).promise;
    const rows: LineRow[] = [];
    for (let pageNum = 1; pageNum <= document.numPages; pageNum++) {
        const page = await document.getPage(pageNum);
        const content = await page.getTextContent();
        let buffer = "";
        let lineNum = 0;
        const flush = (): void => {
            const trimmed = buffer.trim();
            if (trimmed.length > 0) {
                lineNum += 1;
                rows.push({ page: pageNum, line: lineNum, text: trimmed });
            }
            buffer = "";
        };
        for (const item of content.items) {
            if (!("str" in item)) {
                continue;
            }
            buffer += item.str;
            if (item.hasEOL) {
                flush();
            }
        }
        flush();
    }
    return rows;
}
