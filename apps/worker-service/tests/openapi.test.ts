import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    DEFAULT_MAX_UPLOAD_BYTES,
    DEFAULT_MAX_UPLOAD_FILES,
    DEFAULT_RATE_LIMIT_MAX_REQUESTS,
    DEFAULT_RATE_LIMIT_WINDOW_MS,
} from "@backed/runner";
import { DEFAULT_HOST, type WorkerServiceConfig } from "../src/config.js";
import {
    assertOpenApiDocumentsRoutes,
    DOCUMENTED_HTTP_ROUTES,
    loadOpenApiSpec,
} from "../src/openapi.js";
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

describe("OpenAPI", () => {
    it("documents every HTTP route exposed by the service", () => {
        const spec = loadOpenApiSpec();
        expect(() => {
            assertOpenApiDocumentsRoutes(spec);
        }).not.toThrow();
        expect(DOCUMENTED_HTTP_ROUTES.length).toBeGreaterThan(0);
    });

    describe("GET /openapi.yaml", () => {
        let close: () => Promise<void>;
        let baseUrl: string;

        beforeEach(async () => {
            const service = await startWorkerService({
                config: createTestConfig("/tmp/worker-openapi"),
                runStore: new MemoryRunStore(),
            });
            baseUrl = service.url;
            close = service.close;
        });

        afterEach(async () => {
            await close();
        });

        it("serves the spec without authentication", async () => {
            const response = await fetch(`${baseUrl}/openapi.yaml`);
            expect(response.status).toBe(200);
            expect(response.headers.get("content-type")).toContain("yaml");
            const body = await response.text();
            expect(body).toContain("openapi: 3.1.0");
            expect(body).toContain("Backed Worker Service API");
            assertOpenApiDocumentsRoutes(body);
        });
    });
});
