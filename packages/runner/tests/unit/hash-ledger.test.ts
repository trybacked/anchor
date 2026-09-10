import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openHashLedger, partitionFilesByLedger } from "../../src/hash-ledger.js";

describe("HashLedger", () => {
    it("records and recognizes hashes", async () => {
        const dir = await mkdtemp(join(tmpdir(), "ledger-"));
        const ledger = await openHashLedger(join(dir, "ledger.json"));
        expect(ledger.known("abc")).toBe(false);
        await ledger.record("abc", "run-1");
        expect(ledger.known("abc")).toBe(true);
        expect(ledger.get("abc")?.runId).toBe("run-1");
    });

    it("tolerates corrupt ledger files", async () => {
        const dir = await mkdtemp(join(tmpdir(), "ledger-corrupt-"));
        const filePath = join(dir, "ledger.json");
        const { writeFile } = await import("node:fs/promises");
        await writeFile(filePath, "{broken", "utf8");
        const ledger = await openHashLedger(filePath);
        expect(ledger.known("abc")).toBe(false);
    });

    it("partitions known and unknown files", async () => {
        const dir = await mkdtemp(join(tmpdir(), "ledger-partition-"));
        const ledger = await openHashLedger(join(dir, "ledger.json"));
        await ledger.record("hash-a", "run-1");
        const result = partitionFilesByLedger([
            { fileName: "a.txt", content: Buffer.from("a"), contentHash: "hash-a" },
            { fileName: "b.txt", content: Buffer.from("b"), contentHash: "hash-b" },
        ], ledger);
        expect(result.known).toHaveLength(1);
        expect(result.unknown).toHaveLength(1);
    });
});
