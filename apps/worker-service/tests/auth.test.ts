import { describe, expect, it } from "vitest";
import { assertTenantAccess, resolveAuthContext, TenantAccessDeniedError } from "../src/auth.js";
import type { WorkerServiceConfig } from "../src/config.js";

function createConfig(overrides: Partial<WorkerServiceConfig> = {}): WorkerServiceConfig {
    return {
        host: "127.0.0.1",
        port: 0,
        dataRoot: "./worker-data",
        authToken: "dev-token",
        partners: [],
        maxUploadBytes: 1024,
        maxUploadFiles: 10,
        rateLimitWindowMs: 60_000,
        rateLimitMaxRequests: 120,
        skipEmbed: true,
        ...overrides,
    };
}

describe("partner auth", () => {
    it("accepts the default dev token", () => {
        const auth = resolveAuthContext("dev-token", createConfig());
        expect(auth?.partnerId).toBe("default");
    });

    it("accepts partner tokens from config", () => {
        const auth = resolveAuthContext("lexroom-secret", createConfig({
            partners: [{
                partnerId: "lexroom",
                token: "lexroom-secret",
                tenantIdPattern: "^lexroom-",
            }],
        }));
        expect(auth?.partnerId).toBe("lexroom");
    });

    it("rejects unknown tokens", () => {
        expect(resolveAuthContext("wrong", createConfig())).toBeNull();
    });

    it("enforces tenant prefix for partner tokens", () => {
        const config = createConfig({
            authToken: "",
            partners: [{
                partnerId: "lexroom",
                token: "lexroom-secret",
                tenantIdPattern: "^lexroom-",
            }],
        });
        const auth = resolveAuthContext("lexroom-secret", config);
        expect(auth).not.toBeNull();
        expect(() => {
            assertTenantAccess(auth!, "acme", config);
        }).toThrow(TenantAccessDeniedError);
        expect(() => {
            assertTenantAccess(auth!, "lexroom-client-1", config);
        }).not.toThrow();
    });
});
