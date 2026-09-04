import { readFile } from "node:fs/promises";

import { detectEncoding } from "./csv-dialect.js";
import { linesFromPlainText } from "./line-table.js";
import type { LineRow } from "./line-table.js";

export async function extractTextFileLines(absolutePath: string): Promise<LineRow[]> {
  const encoding = await detectEncoding(absolutePath);
  const buffer = await readFile(absolutePath);
  const text =
    encoding === "latin-1" ? buffer.toString("latin1") : buffer.toString("utf-8");
  return linesFromPlainText(text);
}
