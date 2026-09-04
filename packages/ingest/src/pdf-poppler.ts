import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_OCR_DPI = 150;

let popplerAvailable: boolean | null = null;

function ocrDpi(): number {
  const raw = process.env["BACKED_OCR_DPI"];
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_OCR_DPI;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 72) {
    return DEFAULT_OCR_DPI;
  }
  return Math.floor(parsed);
}

/** True when `pdftoppm` from Poppler is on PATH (required for scanned PDF OCR). */
export async function isPopplerAvailable(): Promise<boolean> {
  if (popplerAvailable !== null) {
    return popplerAvailable;
  }
  try {
    await execFileAsync("pdftoppm", ["-h"]);
    popplerAvailable = true;
  } catch {
    try {
      await execFileAsync("which", ["pdftoppm"]);
      popplerAvailable = true;
    } catch {
      popplerAvailable = false;
    }
  }
  return popplerAvailable;
}

/** Render one PDF page to PNG via Poppler. Returns null when Poppler is missing. */
export async function renderPdfPagePng(
  absolutePath: string,
  pageNum: number,
): Promise<Buffer | null> {
  if (!(await isPopplerAvailable())) {
    return null;
  }

  const tempDir = await mkdtemp(join(tmpdir(), "backed-pdf-ocr-"));
  const prefix = join(tempDir, "page");
  const dpi = ocrDpi();

  try {
    await execFileAsync("pdftoppm", [
      "-png",
      "-singlefile",
      "-f",
      String(pageNum),
      "-l",
      String(pageNum),
      "-r",
      String(dpi),
      absolutePath,
      prefix,
    ]);
    return await readFile(`${prefix}.png`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
