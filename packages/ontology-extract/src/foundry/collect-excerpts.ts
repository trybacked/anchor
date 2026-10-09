import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DocumentExcerpt } from "./prompt.js";

export type CollectPdfExcerptsOptions = {
  root: string;
  maxPages?: number;
  maxCharsPerDoc?: number;
  maxFileBytes?: number;
};

const DEFAULT_MAX_PAGES = 3;
const DEFAULT_MAX_CHARS = 2_200;
const DEFAULT_MAX_FILE_BYTES = 12 * 1024 * 1024;

export function pdftotextAvailable(): boolean {
  try {
    execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function listPdfFiles(root: string, maxFileBytes: number): string[] {
  const names = readdirSync(root).filter((name) => name.toLowerCase().endsWith(".pdf"));
  return names.filter((name) => statSync(join(root, name)).size <= maxFileBytes).sort();
}

export function collectPdfExcerpts(options: CollectPdfExcerptsOptions): DocumentExcerpt[] {
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const maxChars = options.maxCharsPerDoc ?? DEFAULT_MAX_CHARS;
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  if (!pdftotextAvailable()) {
    throw new Error("pdftotext is required for Foundry extract (install poppler).");
  }
  const files = listPdfFiles(options.root, maxFileBytes);
  return files.map((file) => {
    const text = execFileSync(
      "pdftotext",
      ["-enc", "UTF-8", "-q", "-f", "1", "-l", String(maxPages), join(options.root, file), "-"],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxChars);
    return { file, excerpt: text };
  });
}
