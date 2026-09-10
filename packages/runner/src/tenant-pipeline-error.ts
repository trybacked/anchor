import type { DeletionLogEntry } from "./gc.js";

export class TenantPipelineError extends Error {
    readonly deletionEntry: DeletionLogEntry;

    constructor(message: string, deletionEntry: DeletionLogEntry, options?: { cause?: unknown }) {
        super(message, options);
        this.name = "TenantPipelineError";
        this.deletionEntry = deletionEntry;
    }
}
