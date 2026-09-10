import { DuckDBInstance } from "@duckdb/node-api";
import type { SqlQuery } from "./types.js";
export interface DuckDbSession {
    query: SqlQuery;
    close: () => void;
}
export interface DuckDbSessionOptions {
    databasePath?: string;
    readOnly?: boolean;
}
export async function createDuckDbSession(options: DuckDbSessionOptions = {}): Promise<DuckDbSession> {
    const { databasePath = ":memory:", readOnly = false } = options;
    const duckOptions = readOnly ? { access_mode: "READ_ONLY" } : undefined;
    if (!readOnly) {
        const instance = await DuckDBInstance.create(databasePath, duckOptions);
        const connection = await instance.connect();
        const session: DuckDbSession = {
            async query(sql) {
                const reader = await connection.runAndReadAll(sql);
                return reader.getRowObjectsJson();
            },
            close() {
                connection.closeSync();
                instance.closeSync();
            },
        };
        Object.assign(session, { instance, connection });
        return session;
    }
    return {
        async query(sql) {
            const instance = await DuckDBInstance.create(databasePath, duckOptions);
            const connection = await instance.connect();
            try {
                const reader = await connection.runAndReadAll(sql);
                return reader.getRowObjectsJson();
            }
            finally {
                connection.closeSync();
                instance.closeSync();
            }
        },
        close() {
        },
    };
}
