import type { BlobStore } from "@trybacked/registry";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type BlobStoreWriteOptions = {
  overwrite?: boolean | undefined;
};

export function createFilesystemBlobStore(basePath: string): BlobStore {
  const root = basePath;
  return {
    read: (path: string) => {
      const full = join(root, path.replace(/^\//, ""));
      try {
        return Promise.resolve(readFileSync(full, "utf8"));
      } catch {
        return Promise.resolve(null);
      }
    },
    write: (path: string, text: string, options?: BlobStoreWriteOptions) => {
      const full = join(root, path.replace(/^\//, ""));
      if (options?.overwrite !== true) {
        try {
          readFileSync(full);
          throw new Error(`Blob already exists at ${path}`);
        } catch (error) {
          if (error instanceof Error && error.message.startsWith("Blob already exists")) {
            throw error;
          }
        }
      }
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, text, "utf8");
      return Promise.resolve();
    },
  };
}
