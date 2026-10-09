import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DocumentExcerpt } from "./prompt.js";

export type CollectPdfExcerptsOptions = {
  root: string;
  startPage?: number;
  maxPages?: number;
  maxCharsPerDoc?: number;
  maxFileBytes?: number;
};

const DEFAULT_START_PAGE = 2;
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_MAX_CHARS = 4_000;
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

function excerptFromPdfPath(
  absolutePath: string,
  label: string,
  startPage: number,
  maxPages: number,
  maxChars: number,
): DocumentExcerpt {
  const endPage = startPage + maxPages - 1;
  const text = execFileSync(
    "pdftotext",
    [
      "-enc",
      "UTF-8",
      "-q",
      "-f",
      String(startPage),
      "-l",
      String(endPage),
      absolutePath,
      "-",
    ],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
  return { file: label, excerpt: text };
}

export function collectPdfExcerptsFromPaths(
  files: readonly { label: string; absolutePath: string }[],
  options?: Omit<CollectPdfExcerptsOptions, "root">,
): DocumentExcerpt[] {
  const startPage = options?.startPage ?? DEFAULT_START_PAGE;
  const maxPages = options?.maxPages ?? DEFAULT_MAX_PAGES;
  const maxChars = options?.maxCharsPerDoc ?? DEFAULT_MAX_CHARS;
  if (!pdftotextAvailable()) {
    throw new Error("pdftotext is required for Foundry extract (install poppler).");
  }
  return files.map((entry) =>
    excerptFromPdfPath(entry.absolutePath, entry.label, startPage, maxPages, maxChars),
  );
}

export function pdfPageCount(absolutePath: string): number {
  if (!pdftotextAvailable()) {
    return 0;
  }
  try {
    const info = execFileSync("pdfinfo", [absolutePath], { encoding: "utf8", maxBuffer: 1024 * 1024 });
    const match = info.match(/^Pages:\s+(\d+)/m);
    if (match === null) {
      return 0;
    }
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function collectPdfExcerpts(options: CollectPdfExcerptsOptions): DocumentExcerpt[] {
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  if (!pdftotextAvailable()) {
    throw new Error("pdftotext is required for Foundry extract (install poppler).");
  }
  const files = listPdfFiles(options.root, maxFileBytes);
  return collectPdfExcerptsFromPaths(
    files.map((file) => ({ label: file, absolutePath: join(options.root, file) })),
    options,
  );
}
