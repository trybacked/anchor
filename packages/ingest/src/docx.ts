import mammoth from "mammoth";

import { linesFromPlainText } from "./line-table.js";
import type { LineRow } from "./line-table.js";

export async function extractDocxLines(absolutePath: string): Promise<LineRow[]> {
  const result = await mammoth.extractRawText({ path: absolutePath });
  return linesFromPlainText(result.value);
}
