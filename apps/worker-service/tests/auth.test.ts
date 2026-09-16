import { describe, expect, it, vi } from "vitest";
import { assertTenantAccess, TenantAccessDeniedError } from "../src/auth.js";
import type { WorkerServiceConfig } from "../src/config.js";
import { createPartnerRegistry } from "../src/partner-registry.js";

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
    it("accepts the default dev token", async () => {
        const registry = createPartnerRegistry({ config: createConfig() });
        const auth = await registry.resolveToken("dev-token");
        expect(auth?.partnerId).toBe("default");
    });

    it("accepts partner tokens from config", async () => {
        const registry = createPartnerRegistry({
            config: createConfig({
                partners: [{
                    partnerId: "partner-a",
                    token: "partner-a-secret",
                    tenantIdPattern: "^partner-a-",
                }],
            }),
        });
        const auth = await registry.resolveToken("partner-a-secret");
        expect(auth?.partnerId).toBe("partner-a");
    });

    it("rejects unknown tokens", async () => {
        const registry = createPartnerRegistry({ config: createConfig() });
        expect(await registry.resolveToken("wrong")).toBeNull();
    });

    it("enforces tenant prefix for partner tokens", async () => {
        const config = createConfig({
            authToken: "",
            partners: [{
                partnerId: "partner-a",
                token: "partner-a-secret",
                tenantIdPattern: "^partner-a-",
            }],
        });
        const registry = createPartnerRegistry({ config });
        const auth = await registry.resolveToken("partner-a-secret");
        expect(auth).not.toBeNull();
        expect(() => {
            assertTenantAccess(auth!, "acme", registry);
        }).toThrow(TenantAccessDeniedError);
        expect(() => {
            assertTenantAccess(auth!, "partner-a-client-1", registry);
        }).not.toThrow();
    });

    it("resolves partner tokens via control plane", async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
            partner: {
                partnerId: "pilot-rag",
                tenantIdPattern: "^pilot-",
                webhooks: { runCompleted: "https://example.com/webhook" },
                webhookSecret: "whsec_test",
            },
        }), { status: 200 }));
        const registry = createPartnerRegistry({
            config: createConfig({
                authToken: "",
                controlPlane: {
                    url: "https://cloud.example",
                    internalSecret: "internal-secret",
                },
            }),
            fetchImpl,
        });
        const auth = await registry.resolveToken("bkd_live_test");
        expect(auth?.partnerId).toBe("pilot-rag");
        expect(fetchImpl).toHaveBeenCalledOnce();
    });
});
