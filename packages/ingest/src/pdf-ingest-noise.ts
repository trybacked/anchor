import { OCR_STDERR_DRAIN_MS, PDF_INGEST_NOISE_PATTERN } from "./constants.js";
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
    return PDF_INGEST_NOISE_PATTERN.test(text);
}
export function beginPdfIngestNoiseFilter(): void {
    if (filterDepth === 0) {
        const previousConsoleLog = console.log;
        const previousStderrWrite = process.stderr.write.bind(process.stderr);
        originalConsoleLog = previousConsoleLog;
        originalStderrWrite = previousStderrWrite;
        console.log = (...args: unknown[]) => {
            if (!isPdfIngestNoise(argsToText(args))) {
                previousConsoleLog(...args);
            }
        };
        process.stderr.write = ((chunk, encoding, callback) => {
            if (isPdfIngestNoise(chunkToText(chunk, typeof encoding === "string" ? encoding : undefined))) {
                if (typeof callback === "function") {
                    callback();
                }
                return true;
            }
            return previousStderrWrite(chunk, encoding, callback);
        }) as typeof process.stderr.write;
    }
    filterDepth += 1;
}
async function drainPendingStderr(): Promise<void> {
    await new Promise((resolve) => {
        setTimeout(resolve, OCR_STDERR_DRAIN_MS);
    });
}
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
