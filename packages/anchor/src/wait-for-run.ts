import type { RunStatusResponse } from "./types.js";

export interface RunStatusReader {
    getRunStatus(tenantId: string, runId: string): Promise<RunStatusResponse>;
}

export interface WaitForRunOptions {
    intervalMs?: number;
    signal?: AbortSignal;
    onPoll?: (status: RunStatusResponse) => void;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted === true) {
            reject(signal.reason ?? new Error("Polling aborted."));
            return;
        }

        const timeout = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, ms);

        const onAbort = () => {
            clearTimeout(timeout);
            reject(signal?.reason ?? new Error("Polling aborted."));
        };

        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

export async function waitForRun(
    client: RunStatusReader,
    tenantId: string,
    runId: string,
    options: WaitForRunOptions = {},
): Promise<RunStatusResponse> {
    const intervalMs = options.intervalMs ?? 2_000;

    for (;;) {
        const status = await client.getRunStatus(tenantId, runId);
        options.onPoll?.(status);

        if (status.status === "done" || status.status === "failed") {
            return status;
        }

        await sleep(intervalMs, options.signal);
    }
}
