import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertValidTenantId, createTenantWorkspace, InvalidTenantIdError } from "../../src/tenant-workspace.js";

describe("TenantWorkspace", () => {
    it("creates isolated tenant directories", async () => {
        const root = await mkdtemp(join(tmpdir(), "tenant-root-"));
        const workspace = await createTenantWorkspace(root, "acme-corp");
        expect(workspace.paths.workDir).toContain(`${join(root, "tenants", "acme-corp", "work")}`);
        expect(workspace.paths.persistDir).toContain("persist");
        expect(workspace.paths.sourcesDir).toContain("sources");
    });

    it("rejects hostile tenant ids", () => {
        expect(() => assertValidTenantId("../escape")).toThrow(InvalidTenantIdError);
        expect(() => assertValidTenantId("bad/id")).toThrow(InvalidTenantIdError);
        expect(() => assertValidTenantId("")).toThrow(InvalidTenantIdError);
    });
});
