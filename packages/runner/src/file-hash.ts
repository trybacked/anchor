import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export function hashContent(content: Buffer | string): string {
    const buffer = typeof content === "string" ? Buffer.from(content) : content;
    return createHash("sha256").update(buffer).digest("hex");
}

export async function hashFile(filePath: string): Promise<string> {
    const content = await readFile(filePath);
    return hashContent(content);
}

export interface HashedFile {
    fileName: string;
    absolutePath: string;
    contentHash: string;
}
