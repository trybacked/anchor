import { BACKED_OCR_DPI_ENV } from "./env.js";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { DEFAULT_OCR_DPI, MIN_OCR_DPI, OCR_TEMP_DIR_PREFIX } from "./constants.js";

const execFileAsync = promisify(execFile);
function runPdftoppm(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn("pdftoppm", args, {
            stdio: ["ignore", "ignore", "ignore"],
        });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`pdftoppm exited with code ${String(code)}`));
        });
    });
}
let popplerAvailable: boolean | null = null;
function ocrDpi(): number {
    const raw = process.env[BACKED_OCR_DPI_ENV];
    if (raw === undefined || raw.trim() === "") {
        return DEFAULT_OCR_DPI;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < MIN_OCR_DPI) {
        return DEFAULT_OCR_DPI;
    }
    return Math.floor(parsed);
}
export async function isPopplerAvailable(): Promise<boolean> {
    if (popplerAvailable !== null) {
        return popplerAvailable;
    }
    try {
        await execFileAsync("pdftoppm", ["-h"]);
        popplerAvailable = true;
    }
    catch {
        try {
            await execFileAsync("which", ["pdftoppm"]);
            popplerAvailable = true;
        }
        catch {
            popplerAvailable = false;
        }
    }
    return popplerAvailable;
}
export async function renderPdfPagePng(absolutePath: string, pageNum: number): Promise<Buffer | null> {
    if (!(await isPopplerAvailable())) {
        return null;
    }
    const tempDir = await mkdtemp(join(tmpdir(), OCR_TEMP_DIR_PREFIX));
    const prefix = join(tempDir, "page");
    const dpi = ocrDpi();
    try {
        await runPdftoppm([
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
    }
    finally {
        await rm(tempDir, { recursive: true, force: true });
    }
}
