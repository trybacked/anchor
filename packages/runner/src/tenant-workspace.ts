import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_SOURCES_DIR, MODEL_FILE_NAME, RUN_ARTIFACTS } from "@backed/core";
import {
    DELETION_LOG_FILE_NAME,
    HASH_LEDGER_FILE_NAME,
    TENANT_DIR_NAME,
    TENANT_ID_PATTERN,
    TENANT_PERSIST_DIR_NAME,
    TENANT_WORK_DIR_NAME,
} from "./config.js";

export class InvalidTenantIdError extends Error {
    constructor(tenantId: string) {
        super(`Invalid tenant id: ${tenantId}`);
        this.name = "InvalidTenantIdError";
    }
}

export function assertValidTenantId(tenantId: string): void {
    if (tenantId.includes("..") || tenantId.includes("/") || tenantId.includes("\\") || !TENANT_ID_PATTERN.test(tenantId)) {
        throw new InvalidTenantIdError(tenantId);
    }
}

export interface TenantWorkspacePaths {
    tenantId: string;
    tenantRoot: string;
    workDir: string;
    persistDir: string;
    sourcesDir: string;
    ledgerPath: string;
    deletionLogPath: string;
    modelPath: string;
    proposalPath: string;
    reviewPath: string;
}

export interface TenantWorkspace {
    tenantId: string;
    paths: TenantWorkspacePaths;
}

function buildTenantPaths(dataRoot: string, tenantId: string): TenantWorkspacePaths {
    assertValidTenantId(tenantId);
    const tenantRoot = path.join(path.resolve(dataRoot), TENANT_DIR_NAME, tenantId);
    const persistDir = path.join(tenantRoot, TENANT_PERSIST_DIR_NAME);
    const workDir = path.join(tenantRoot, TENANT_WORK_DIR_NAME);
    return {
        tenantId,
        tenantRoot,
        workDir,
        persistDir,
        sourcesDir: path.join(workDir, path.basename(path.normalize(DEFAULT_SOURCES_DIR))),
        ledgerPath: path.join(persistDir, HASH_LEDGER_FILE_NAME),
        deletionLogPath: path.join(persistDir, DELETION_LOG_FILE_NAME),
        modelPath: path.join(persistDir, MODEL_FILE_NAME),
        proposalPath: path.join(persistDir, RUN_ARTIFACTS.proposal),
        reviewPath: path.join(persistDir, RUN_ARTIFACTS.review),
    };
}

export async function createTenantWorkspace(dataRoot: string, tenantId: string): Promise<TenantWorkspace> {
    const paths = buildTenantPaths(dataRoot, tenantId);
    await mkdir(paths.persistDir, { recursive: true });
    await mkdir(paths.sourcesDir, { recursive: true });
    return { tenantId, paths };
}

export function resolveTenantWorkspace(dataRoot: string, tenantId: string): TenantWorkspace {
    return {
        tenantId,
        paths: buildTenantPaths(dataRoot, tenantId),
    };
}
