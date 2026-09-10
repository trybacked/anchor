import { EMPTY_BURST_USAGE } from "@backed/semantic";
import type { PipelineStats } from "./types.js";

export const MS_PER_SECOND = 1000;
export const CORPUS_SAMPLE_LINES_PER_TABLE = 25;
export const PROPOSAL_ONTOLOGY_PREFIX = "Building ontology";
export const JSON_PRETTY_INDENT = 2;

export const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;

export const TENANT_DIR_NAME = "tenants";
export const TENANT_WORK_DIR_NAME = "work";
export const TENANT_PERSIST_DIR_NAME = "persist";

export const HASH_LEDGER_FILE_NAME = "ledger.json";
export const DELETION_LOG_FILE_NAME = "deletion-log.jsonl";

export const ZERO_PIPELINE_STAGE_TIMINGS = {
    ingestMs: 0,
    documentsMs: 0,
    extractionMs: 0,
    embedMs: 0,
    profileMs: 0,
    proposalMs: 0,
} as const;

export const SKIPPED_PIPELINE_STATS: PipelineStats = {
    ...ZERO_PIPELINE_STAGE_TIMINGS,
    llmUsage: EMPTY_BURST_USAGE,
    skippedLlm: true,
};

export const DEFAULT_MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
export const DEFAULT_MAX_UPLOAD_FILES = 500;

export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
export const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 120;
