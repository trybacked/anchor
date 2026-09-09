import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function createTempWorkspace(prefix: string): Promise<string> {
    return mkdtemp(join(tmpdir(), prefix));
}

export async function removeTempWorkspace(dir: string | undefined): Promise<void> {
    if (dir === undefined) {
        return;
    }
    await rm(dir, { recursive: true, force: true });
}
