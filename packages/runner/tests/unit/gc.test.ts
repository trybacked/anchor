import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectGarbage, readDeletionLog } from "../../src/gc.js";
import { createTenantWorkspace } from "../../src/tenant-workspace.js";

describe("collectGarbage", () => {
    it("removes work dir and appends deletion log", async () => {
        const root = await mkdtemp(join(tmpdir(), "gc-root-"));
        const workspace = await createTenantWorkspace(root, "tenant-a");
        await mkdir(join(workspace.paths.workDir, "nested"), { recursive: true });
        await writeFile(join(workspace.paths.workDir, "nested", "secret.txt"), "temporary", "utf8");
        await writeFile(workspace.paths.modelPath, "metadata:\n  formatVersion: \"1\"\n", "utf8");
        await collectGarbage(workspace.paths, "run-1");
        expect(existsSync(workspace.paths.workDir)).toBe(false);
        expect(existsSync(workspace.paths.modelPath)).toBe(true);
        await mkdir(workspace.paths.workDir, { recursive: true });
        await writeFile(join(workspace.paths.workDir, "again.txt"), "x", "utf8");
        const second = await collectGarbage(workspace.paths, "run-2");
        const log = await readDeletionLog(workspace.paths.deletionLogPath);
        expect(log).toHaveLength(2);
        expect(log[0]?.runId).toBe("run-1");
        expect(log[1]?.runId).toBe("run-2");
        expect(second.entry.bytesDeleted).toBeGreaterThan(0);
        const raw = await readFile(workspace.paths.deletionLogPath, "utf8");
        expect(raw.split("\n").filter((line) => line.trim().length > 0)).toHaveLength(2);
    });
});
