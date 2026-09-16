import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TenantInputFile } from "../../src/run-tenant.js";

const FIXTURE_SOURCES_DIR = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../fixtures/gerace-albo/sources",
);

function assertFixturePresent(): void {
    if (!existsSync(FIXTURE_SOURCES_DIR)) {
        throw new Error(
            `Missing Gerace fixture at ${FIXTURE_SOURCES_DIR}. Commit fixtures/gerace-albo/sources/ or clone the full repo.`,
        );
    }
}

export function loadGeraceSourceFiles(): TenantInputFile[] {
    assertFixturePresent();
    const fileNames = readdirSync(FIXTURE_SOURCES_DIR).sort();
    return fileNames.map((fileName) => ({
        fileName,
        content: readFileSync(join(FIXTURE_SOURCES_DIR, fileName)),
    }));
}

export function buildIncrementalTestFile(): TenantInputFile {
    const template = readFileSync(join(FIXTURE_SOURCES_DIR, "atto_1124.txt"), "utf8");
    const uniqueSuffix = "\nNumero pubblicazione: 9999\nNota incrementale: golden test run\n";
    return {
        fileName: "atto_9999_test.txt",
        content: Buffer.from(`${template}${uniqueSuffix}`, "utf8"),
    };
}
