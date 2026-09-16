import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
    patchTenantPipelineConfig,
    readTenantPipelineConfig,
    resolveTenantPipelineConfig,
    writeTenantPipelineConfig,
} from "../../src/tenant-config.js";

describe("tenant pipeline config", () => {
    let persistDir: string;

    afterEach(() => {
        rmSync(persistDir, { recursive: true, force: true });
    });

    it("returns defaults when no config file exists", () => {
        persistDir = mkdtempSync(join(tmpdir(), "tenant-config-"));
        expect(readTenantPipelineConfig(persistDir)).toEqual({
            documentTypeHints: [],
            domain: undefined,
        });
    });

    it("persists and merges run overrides", () => {
        persistDir = mkdtempSync(join(tmpdir(), "tenant-config-"));
        writeTenantPipelineConfig(persistDir, {
            documentTypeHints: [
                {
                    match: "invoice",
                    documentType: "invoice",
                    documentTypeLabel: "Invoice",
                    confidence: 0.95,
                },
            ],
        });

        const resolved = resolveTenantPipelineConfig(persistDir, {
            documentTypeHints: [
                {
                    match: "determinazioni",
                    documentType: "municipal_determination",
                    documentTypeLabel: "Determinazione",
                    confidence: 0.95,
                },
            ],
        });
        writeTenantPipelineConfig(persistDir, resolved);

        expect(readTenantPipelineConfig(persistDir).documentTypeHints[0]?.match).toBe("determinazioni");
    });
});
