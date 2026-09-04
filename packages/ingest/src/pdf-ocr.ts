import { readFile } from "node:fs/promises";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createWorker } from "tesseract.js";
import type { Worker } from "tesseract.js";

import { isPopplerAvailable, renderPdfPagePng } from "./pdf-poppler.js";
import type { PdfLine } from "./pdf.js";

const DEFAULT_OCR_MAX_PAGES = 30;

function ocrLanguages(): string {
  const configured = process.env["BACKED_OCR_LANG"]?.trim();
  return configured !== undefined && configured.length > 0 ? configured : "eng";
}

let workerPromise: Promise<Worker> | null = null;

function ocrEnabled(): boolean {
  const flag = process.env["BACKED_SKIP_OCR"]?.trim().toLowerCase();
  return flag !== "1" && flag !== "true" && flag !== "yes";
}

function ocrMaxPages(): number {
  const raw = process.env["BACKED_OCR_MAX_PAGES"];
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_OCR_MAX_PAGES;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_OCR_MAX_PAGES;
  }
  return Math.floor(parsed);
}

async function getOcrWorker(): Promise<Worker> {
  if (workerPromise === null) {
    workerPromise = (async () => {
      const worker = await createWorker(ocrLanguages());
      return worker;
    })();
  }
  return workerPromise;
}

export async function terminateOcrWorker(): Promise<void> {
  if (workerPromise === null) {
    return;
  }
  const worker = await workerPromise;
  await worker.terminate();
  workerPromise = null;
}

function linesFromOcrText(pageNum: number, text: string): PdfLine[] {
  const rows: PdfLine[] = [];
  let lineNum = 0;
  for (const raw of text.split(/\r?\n/u)) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      continue;
    }
    lineNum += 1;
    rows.push({ page: pageNum, line: lineNum, text: trimmed });
  }
  return rows;
}

/** OCR scanned PDF pages when embedded text extraction returns nothing. */
export async function ocrPdfLines(absolutePath: string): Promise<PdfLine[]> {
  if (!ocrEnabled()) {
    return [];
  }
  if (!(await isPopplerAvailable())) {
    return [];
  }

  const worker = await getOcrWorker();
  const data = new Uint8Array(await readFile(absolutePath));
  const document = await getDocument({ data, useSystemFonts: true }).promise;
  const maxPages = Math.min(document.numPages, ocrMaxPages());
  const rows: PdfLine[] = [];

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const pngBuffer = await renderPdfPagePng(absolutePath, pageNum);
    if (pngBuffer === null) {
      break;
    }
    const result = await worker.recognize(pngBuffer);
    rows.push(...linesFromOcrText(pageNum, result.data.text));
  }

  return rows;
}
