import { openHashLedger, readDeletionLog, type DeletionLogEntry } from "@backed/runner";

export const DEFAULT_AUDIT_PAGE_LIMIT = 100;
export const MAX_AUDIT_PAGE_LIMIT = 1000;

export interface AuditDateRange {
    since?: Date;
    until?: Date;
}

export interface DeletionLogQuery extends AuditDateRange {
    offset: number;
    limit: number;
}

export interface PaginatedDeletionsResponse {
    entries: DeletionLogEntry[];
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
}

export interface LedgerAuditResponse {
    hashes: string[];
}

export type AuditQueryParseResult =
    | { ok: true; query: DeletionLogQuery }
    | { ok: false; error: "invalid_date" | "invalid_pagination" };

function parseOptionalIsoDate(value: string | null): Date | undefined | "invalid" {
    if (value === null || value.length === 0) {
        return undefined;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return "invalid";
    }
    return parsed;
}

export function parseDeletionLogQuery(searchParams: URLSearchParams): AuditQueryParseResult {
    const sinceRaw = searchParams.get("since");
    const untilRaw = searchParams.get("until");
    const since = parseOptionalIsoDate(sinceRaw);
    if (since === "invalid") {
        return { ok: false, error: "invalid_date" };
    }
    const until = parseOptionalIsoDate(untilRaw);
    if (until === "invalid") {
        return { ok: false, error: "invalid_date" };
    }
    if (since !== undefined && until !== undefined && since.getTime() > until.getTime()) {
        return { ok: false, error: "invalid_date" };
    }
    const offsetRaw = searchParams.get("offset") ?? "0";
    const limitRaw = searchParams.get("limit") ?? String(DEFAULT_AUDIT_PAGE_LIMIT);
    const offset = Number.parseInt(offsetRaw, 10);
    const limit = Number.parseInt(limitRaw, 10);
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > MAX_AUDIT_PAGE_LIMIT) {
        return { ok: false, error: "invalid_pagination" };
    }
    return {
        ok: true,
        query: {
            ...(since !== undefined ? { since } : {}),
            ...(until !== undefined ? { until } : {}),
            offset,
            limit,
        },
    };
}

function matchesDateRange(entry: DeletionLogEntry, range: AuditDateRange): boolean {
    const deletedAt = new Date(entry.deletedAt).getTime();
    if (range.since !== undefined && deletedAt < range.since.getTime()) {
        return false;
    }
    if (range.until !== undefined && deletedAt > range.until.getTime()) {
        return false;
    }
    return true;
}

export async function queryDeletionLog(
    logPath: string,
    query: DeletionLogQuery,
): Promise<PaginatedDeletionsResponse> {
    const filtered = (await readDeletionLog(logPath)).filter((entry) => matchesDateRange(entry, query));
    const page = filtered.slice(query.offset, query.offset + query.limit);
    return {
        entries: page,
        total: filtered.length,
        offset: query.offset,
        limit: query.limit,
        hasMore: query.offset + page.length < filtered.length,
    };
}

export async function readLedgerAudit(ledgerPath: string): Promise<LedgerAuditResponse> {
    const ledger = await openHashLedger(ledgerPath);
    return {
        hashes: ledger.listHashes().sort(),
    };
}
