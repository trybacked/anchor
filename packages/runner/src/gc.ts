import { appendFile, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { TenantWorkspacePaths } from "./tenant-workspace.js";

export const DeletionLogEntrySchema = z.object({
    runId: z.string().min(1),
    tenantId: z.string().min(1),
    deletedAt: z.string().datetime(),
    filesDeleted: z.number().int().nonnegative(),
    bytesDeleted: z.number().int().nonnegative(),
});

export type DeletionLogEntry = z.infer<typeof DeletionLogEntrySchema>;

export interface GarbageCollectionResult {
    entry: DeletionLogEntry;
    logLineIndex: number;
}

async function measureTree(root: string): Promise<{ filesDeleted: number; bytesDeleted: number }> {
    let filesDeleted = 0;
    let bytesDeleted = 0;
    async function walk(current: string): Promise<void> {
        let entries;
        try {
            entries = await readdir(current, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            const entryPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                await walk(entryPath);
                await rm(entryPath, { recursive: true, force: true });
            }
            else if (entry.isFile()) {
                const info = await stat(entryPath);
                filesDeleted += 1;
                bytesDeleted += info.size;
                await rm(entryPath, { force: true });
            }
        }
    }
    try {
        await walk(root);
        await rm(root, { recursive: true, force: true });
    }
    catch {
        // work dir may already be absent
    }
    return { filesDeleted, bytesDeleted };
}

async function appendDeletionLog(logPath: string, entry: DeletionLogEntry): Promise<number> {
    await mkdir(path.dirname(logPath), { recursive: true });
    let existingLines = 0;
    try {
        const raw = await readFile(logPath, "utf8");
        existingLines = raw.length > 0 ? raw.split("\n").filter((line) => line.trim().length > 0).length : 0;
    }
    catch {
        existingLines = 0;
    }
    await appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
    return existingLines;
}

export async function collectGarbage(
    paths: TenantWorkspacePaths,
    runId: string,
    deletedAt: Date = new Date(),
): Promise<GarbageCollectionResult> {
    const { filesDeleted, bytesDeleted } = await measureTree(paths.workDir);
    const entry = DeletionLogEntrySchema.parse({
        runId,
        tenantId: paths.tenantId,
        deletedAt: deletedAt.toISOString(),
        filesDeleted,
        bytesDeleted,
    });
    const logLineIndex = await appendDeletionLog(paths.deletionLogPath, entry);
    return { entry, logLineIndex };
}

export async function readDeletionLog(logPath: string): Promise<DeletionLogEntry[]> {
    try {
        const raw = await readFile(logPath, "utf8");
        return raw
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .map((line) => DeletionLogEntrySchema.parse(JSON.parse(line)));
    }
    catch {
        return [];
    }
}
