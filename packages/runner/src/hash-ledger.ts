import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { JSON_PRETTY_INDENT } from "./config.js";

const LedgerEntrySchema = z.object({
    firstSeenAt: z.string().datetime(),
    runId: z.string().min(1),
});

const LedgerSchema = z.record(LedgerEntrySchema);

export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;
export type HashLedgerData = z.infer<typeof LedgerSchema>;

export interface HashLedger {
    known(hash: string): boolean;
    get(hash: string): LedgerEntry | undefined;
    record(hash: string, runId: string, seenAt?: Date): Promise<void>;
    listHashes(): string[];
}

function emptyLedger(): HashLedgerData {
    return {};
}

function parseLedger(raw: string): HashLedgerData {
    try {
        const parsed: unknown = JSON.parse(raw);
        return LedgerSchema.parse(parsed);
    }
    catch {
        return emptyLedger();
    }
}

async function loadLedger(filePath: string): Promise<HashLedgerData> {
    try {
        const raw = await readFile(filePath, "utf8");
        return parseLedger(raw);
    }
    catch {
        return emptyLedger();
    }
}

async function saveLedger(filePath: string, ledger: HashLedgerData): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(ledger, null, JSON_PRETTY_INDENT)}\n`, "utf8");
}

export async function openHashLedger(filePath: string): Promise<HashLedger> {
    let ledger = await loadLedger(filePath);
    return {
        known(hash: string) {
            return ledger[hash] !== undefined;
        },
        get(hash: string) {
            return ledger[hash];
        },
        async record(hash: string, runId: string, seenAt: Date = new Date()) {
            ledger = {
                ...ledger,
                [hash]: {
                    firstSeenAt: seenAt.toISOString(),
                    runId,
                },
            };
            await saveLedger(filePath, ledger);
        },
        listHashes() {
            return Object.keys(ledger);
        },
    };
}

export function partitionFilesByLedger<T extends { contentHash: string }>(
    files: T[],
    ledger: HashLedger,
): { known: T[]; unknown: T[] } {
    const known: T[] = [];
    const unknown: T[] = [];
    for (const file of files) {
        if (ledger.known(file.contentHash)) {
            known.push(file);
        }
        else {
            unknown.push(file);
        }
    }
    return { known, unknown };
}
