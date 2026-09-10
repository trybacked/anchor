import { appendFile, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    DEFAULT_MAX_UPLOAD_BYTES,
    DEFAULT_MAX_UPLOAD_FILES,
    DEFAULT_RATE_LIMIT_MAX_REQUESTS,
    DEFAULT_RATE_LIMIT_WINDOW_MS,
} from "@backed/runner";
import type { PaginatedDeletionsResponse } from "../src/audit-export.js";
import { DEFAULT_HOST, type WorkerServiceConfig } from "../src/config.js";
import { MemoryRunStore } from "../src/run-store.js";
import { startWorkerService } from "../src/server.js";

function createTestConfig(dataRoot: string): WorkerServiceConfig {
    return {
        host: DEFAULT_HOST,
        port: 0,
        dataRoot,
        authToken: "test-token",
        partners: [],
        maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
        maxUploadFiles: DEFAULT_MAX_UPLOAD_FILES,
        rateLimitWindowMs: DEFAULT_RATE_LIMIT_WINDOW_MS,
        rateLimitMaxRequests: DEFAULT_RATE_LIMIT_MAX_REQUESTS,
        skipEmbed: true,
    };
}

function authHeaders(token = "test-token"): HeadersInit {
    return { Authorization: `Bearer ${token}` };
}

describe("worker-service audit export", () => {
    let dataRoot: string;
    let close: () => Promise<void>;
    let baseUrl: string;

    beforeEach(async () => {
        dataRoot = await mkdtemp(join(tmpdir(), "worker-audit-"));
        const service = await startWorkerService({
            config: createTestConfig(dataRoot),
            runStore: new MemoryRunStore(),
        });
        baseUrl = service.url;
        close = service.close;
    });

    afterEach(async () => {
        await close();
    });

    it("returns paginated deletion log entries without document content", async () => {
        const tenantId = "demo";
        const persistDir = join(dataRoot, "tenants", tenantId, "persist");
        await mkdir(persistDir, { recursive: true });
        const entries = [
            {
                runId: "run-1",
                tenantId,
                deletedAt: "2026-09-01T10:00:00.000Z",
                filesDeleted: 2,
                bytesDeleted: 128,
            },
            {
                runId: "run-2",
                tenantId,
                deletedAt: "2026-09-02T10:00:00.000Z",
                filesDeleted: 1,
                bytesDeleted: 64,
            },
        ];
        await writeFile(
            join(persistDir, "deletion-log.jsonl"),
            `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
            "utf8",
        );

        const response = await fetch(`${baseUrl}/v1/tenants/${tenantId}/audit/deletions?limit=1&offset=0`, {
            headers: authHeaders(),
        });
        expect(response.status).toBe(200);
        const payload = (await response.json()) as PaginatedDeletionsResponse;
        expect(payload.total).toBe(2);
        expect(payload.entries).toHaveLength(1);
        expect(payload.hasMore).toBe(true);
        expect(payload.entries[0]?.runId).toBe("run-1");
        expect(JSON.stringify(payload)).not.toContain("customers.csv");
    });

    it("filters deletion log entries by since and until", async () => {
        const tenantId = "demo";
        const persistDir = join(dataRoot, "tenants", tenantId, "persist");
        await mkdir(persistDir, { recursive: true });
        await appendFile(join(persistDir, "deletion-log.jsonl"), [
            JSON.stringify({
                runId: "old",
                tenantId,
                deletedAt: "2026-08-01T00:00:00.000Z",
                filesDeleted: 1,
                bytesDeleted: 10,
            }),
            JSON.stringify({
                runId: "in-range",
                tenantId,
                deletedAt: "2026-09-05T00:00:00.000Z",
                filesDeleted: 1,
                bytesDeleted: 10,
            }),
            JSON.stringify({
                runId: "new",
                tenantId,
                deletedAt: "2026-10-01T00:00:00.000Z",
                filesDeleted: 1,
                bytesDeleted: 10,
            }),
        ].join("\n") + "\n", "utf8");

        const response = await fetch(
            `${baseUrl}/v1/tenants/${tenantId}/audit/deletions?since=2026-09-01T00:00:00.000Z&until=2026-09-30T23:59:59.999Z`,
            { headers: authHeaders() },
        );
        expect(response.status).toBe(200);
        const payload = (await response.json()) as PaginatedDeletionsResponse;
        expect(payload.total).toBe(1);
        expect(payload.entries[0]?.runId).toBe("in-range");
    });

    it("returns 400 for invalid audit date filters", async () => {
        const response = await fetch(`${baseUrl}/v1/tenants/demo/audit/deletions?since=not-a-date`, {
            headers: authHeaders(),
        });
        expect(response.status).toBe(400);
        const payload = (await response.json()) as { error: string };
        expect(payload.error).toBe("invalid_audit_date");
    });

    it("returns 400 for invalid pagination", async () => {
        const response = await fetch(`${baseUrl}/v1/tenants/demo/audit/deletions?limit=0`, {
            headers: authHeaders(),
        });
        expect(response.status).toBe(400);
        const payload = (await response.json()) as { error: string };
        expect(payload.error).toBe("invalid_audit_pagination");
    });

    it("returns ledger hashes without filenames", async () => {
        const tenantId = "demo";
        const persistDir = join(dataRoot, "tenants", tenantId, "persist");
        await mkdir(persistDir, { recursive: true });
        await writeFile(join(persistDir, "ledger.json"), JSON.stringify({
            abc123: { firstSeenAt: "2026-09-01T00:00:00.000Z", runId: "run-1" },
            def456: { firstSeenAt: "2026-09-02T00:00:00.000Z", runId: "run-2" },
        }, null, 2), "utf8");

        const response = await fetch(`${baseUrl}/v1/tenants/${tenantId}/audit/ledger`, {
            headers: authHeaders(),
        });
        expect(response.status).toBe(200);
        const payload = (await response.json()) as { hashes: string[] };
        expect(payload.hashes).toEqual(["abc123", "def456"]);
        expect(JSON.stringify(payload)).not.toContain("run-1");
    });

    it("returns 401 without bearer auth", async () => {
        const response = await fetch(`${baseUrl}/v1/tenants/demo/audit/deletions`);
        expect(response.status).toBe(401);
    });

    it("returns 403 when partner token accesses a foreign tenant", async () => {
        const service = await startWorkerService({
            config: {
                ...createTestConfig(dataRoot),
                authToken: "",
                partners: [{
                    partnerId: "lexroom",
                    token: "lexroom-secret",
                    tenantIdPattern: "^lexroom-",
                }],
            },
            runStore: new MemoryRunStore(),
        });
        const response = await fetch(`${service.url}/v1/tenants/acme/audit/deletions`, {
            headers: authHeaders("lexroom-secret"),
        });
        await service.close();
        expect(response.status).toBe(403);
    });
});
