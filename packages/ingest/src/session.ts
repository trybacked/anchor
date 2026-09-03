import { DuckDBInstance } from "@duckdb/node-api";

import type { SqlQuery } from "./types.js";

export interface DuckDbSession {
  query: SqlQuery;
  close: () => void;
}

export async function createDuckDbSession(): Promise<DuckDbSession> {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  return {
    async query(sql) {
      const reader = await connection.runAndReadAll(sql);
      return reader.getRowObjectsJson();
    },
    close() {
      connection.closeSync();
      instance.closeSync();
    },
  };
}
