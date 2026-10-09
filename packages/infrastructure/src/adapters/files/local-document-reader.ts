import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type LocalFileReadResult = {
  status: 200 | 206;
  data: Uint8Array;
  contentType: string;
  contentLength?: number | undefined;
  contentRange?: string | undefined;
  acceptRanges?: string | undefined;
};

export type LocalDocumentFileReader = (
  path: string,
  init?: { range?: string | undefined },
) => Promise<LocalFileReadResult>;

export function createLocalDocumentFileReader(sourceRoot: string): LocalDocumentFileReader {
  return (volumePath, init) => {
    const relative = volumePath.replace(/^\/+/, "").replace(/^Volumes\/[^/]+\//, "");
    const full = join(sourceRoot, relative);
    const file = readFileSync(full);
    if (init?.range !== undefined) {
      const match = /^bytes=(\d+)-(\d+)?$/.exec(init.range.trim());
      if (match !== null) {
        const start = Number(match[1]);
        const end = match[2] !== undefined ? Number(match[2]) : file.byteLength - 1;
        const slice = file.subarray(start, end + 1);
        return Promise.resolve({
          status: 206,
          data: slice,
          contentType: "application/octet-stream",
          contentLength: slice.byteLength,
          contentRange: `bytes ${String(start)}-${String(end)}/${String(file.byteLength)}`,
          acceptRanges: "bytes",
        });
      }
    }
    return Promise.resolve({
      status: 200,
      data: file,
      contentType: "application/octet-stream",
      contentLength: statSync(full).size,
    });
  };
}
