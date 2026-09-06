/**
 * Suppresses known-harmless PDF ingest noise from pdf.js (console.log) and
 * Tesseract (stderr) during batch document ingestion.
 */

const PDF_INGEST_NOISE =
  /Image too small to scale|Line cannot be recognized|(?:Warning:\s*)?TT:\s*undefined function/i;

const OCR_STDERR_DRAIN_MS = 400;

let filterDepth = 0;
let originalConsoleLog: typeof console.log | null = null;
let originalStderrWrite: typeof process.stderr.write | null = null;

function chunkToText(chunk: unknown, encoding?: BufferEncoding | (() => void)): string {
  if (typeof chunk === "string") {
    return chunk;
  }
  if (Buffer.isBuffer(chunk)) {
    return chunk.toString(typeof encoding === "string" ? encoding : "utf8");
  }
  return String(chunk);
}

function argsToText(args: unknown[]): string {
  return args.map((arg) => (typeof arg === "string" ? arg : String(arg))).join(" ");
}

function isPdfIngestNoise(text: string): boolean {
  return PDF_INGEST_NOISE.test(text);
}

/** Enable filtering for the current ingest session (ref-counted). */
export function beginPdfIngestNoiseFilter(): void {
  if (filterDepth === 0) {
    originalConsoleLog = console.log;
    console.log = (...args: unknown[]) => {
      if (!isPdfIngestNoise(argsToText(args))) {
        originalConsoleLog!(...args);
      }
    };

    originalStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk, encoding, callback) => {
      if (isPdfIngestNoise(chunkToText(chunk, encoding as BufferEncoding | undefined))) {
        if (typeof callback === "function") {
          callback();
        }
        return true;
      }
      return originalStderrWrite!(chunk, encoding, callback);
    }) as typeof process.stderr.write;
  }
  filterDepth += 1;
}

async function drainPendingStderr(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, OCR_STDERR_DRAIN_MS);
  });
}

/** Disable filtering when the ingest session ends (ref-counted). */
export async function endPdfIngestNoiseFilter(): Promise<void> {
  if (filterDepth === 0) {
    return;
  }
  filterDepth -= 1;
  if (filterDepth > 0) {
    return;
  }

  await drainPendingStderr();

  if (originalConsoleLog !== null) {
    console.log = originalConsoleLog;
    originalConsoleLog = null;
  }
  if (originalStderrWrite !== null) {
    process.stderr.write = originalStderrWrite;
    originalStderrWrite = null;
  }
}

export function isPdfIngestNoiseMessage(text: string): boolean {
  return isPdfIngestNoise(text);
}
