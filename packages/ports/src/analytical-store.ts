import type { SqlParameterValue } from "./warehouse.js";

export type AnalyticalStore = {
  exec(sql: string): Promise<void>;
  query(sql: string, parameters?: Record<string, SqlParameterValue>): Promise<Record<string, unknown>[]>;
  close(): Promise<void>;
};
