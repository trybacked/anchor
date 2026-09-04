import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createExtractorFromFile } from "node-unrar-js";
import unzipper from "unzipper";

const require = createRequire(import.meta.url);
const UNRAR_WASM_PATH = require.resolve("node-unrar-js/dist/js/unrar.wasm");

let unrarWasmBinary: ArrayBuffer | null = null;

async function loadUnrarWasm(): Promise<ArrayBuffer> {
  if (unrarWasmBinary === null) {
    const file = await readFile(UNRAR_WASM_PATH);
    unrarWasmBinary = file.buffer.slice(
      file.byteOffset,
      file.byteOffset + file.byteLength,
    );
  }
  return unrarWasmBinary;
}

export async function createArchiveTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function extractZipArchive(
  absolutePath: string,
  targetDir: string,
): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    createReadStream(absolutePath)
      .pipe(unzipper.Extract({ path: targetDir }))
      .on("close", () => {
        resolve();
      })
      .on("error", (error: Error) => {
        reject(error);
      });
  });
}

export async function extractRarArchive(
  absolutePath: string,
  targetDir: string,
): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  const wasmBinary = await loadUnrarWasm();
  const extractor = await createExtractorFromFile({
    wasmBinary,
    filepath: absolutePath,
    targetPath: targetDir,
  });
  const extracted = extractor.extract();
  for (const _file of extracted.files) {
    // Drain generator so extraction completes on disk.
  }
}
