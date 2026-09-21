import type { DatabricksProviderConfig } from "./config.js";

export type SqlRow = Record<string, unknown>;

type StatementColumn = { name?: string };
type StatementManifest = { schema?: { columns?: StatementColumn[] } };
type StatementStatus = { state?: string };
type StatementResult = {
  status?: StatementStatus;
  manifest?: StatementManifest;
  result?: { data_array?: unknown[][] };
};

type StatementResponse = {
  statement_id?: string;
  status?: StatementStatus;
  manifest?: StatementManifest;
  result?: { data_array?: unknown[][] };
};

export type DatabricksSqlClient = {
  execute: (sql: string) => Promise<SqlRow[]>;
};

const TERMINAL_STATES = new Set(["SUCCEEDED", "FAILED", "CANCELED", "CLOSED"]);
const POLL_INTERVAL_MS = 500;
const MAX_POLL_ATTEMPTS = 120;

function apiBaseUrl(host: string): string {
  return `https://${host}`;
}

function rowsFromStatement(payload: StatementResponse | StatementResult): SqlRow[] {
  const columns = payload.manifest?.schema?.columns ?? [];
  const names = columns.map((column, index) => column.name ?? `col_${String(index)}`);
  const data = payload.result?.data_array ?? [];
  return data.map((values) => {
    const row: SqlRow = {};
    names.forEach((name, index) => {
      row[name] = values[index];
    });
    return row;
  });
}

async function fetchStatement(
  config: DatabricksProviderConfig,
  statementId: string,
): Promise<StatementResponse> {
  const response = await fetch(`${apiBaseUrl(config.host)}/api/2.0/sql/statements/${statementId}`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Databricks statement fetch failed (${String(response.status)}): ${body}`);
  }
  return (await response.json()) as StatementResponse;
}

async function waitForStatement(
  config: DatabricksProviderConfig,
  statementId: string,
): Promise<StatementResponse> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const payload = await fetchStatement(config, statementId);
    const state = payload.status?.state ?? "UNKNOWN";
    if (TERMINAL_STATES.has(state)) {
      if (state !== "SUCCEEDED") {
        throw new Error(`Databricks statement ${statementId} ended with state ${state}`);
      }
      return payload;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Databricks statement ${statementId} timed out while polling`);
}

export function createDatabricksSqlClient(config: DatabricksProviderConfig): DatabricksSqlClient {
  return {
    async execute(sql: string): Promise<SqlRow[]> {
      const response = await fetch(`${apiBaseUrl(config.host)}/api/2.0/sql/statements/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          warehouse_id: config.warehouseId,
          statement: sql,
          wait_timeout: "30s",
          on_wait_timeout: "CONTINUE",
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Databricks SQL failed (${String(response.status)}): ${body}`);
      }
      let payload = (await response.json()) as StatementResponse;
      const state = payload.status?.state ?? "UNKNOWN";
      if (!TERMINAL_STATES.has(state)) {
        if (payload.statement_id === undefined) {
          throw new Error("Databricks SQL returned no statement_id");
        }
        payload = await waitForStatement(config, payload.statement_id);
      } else if (state !== "SUCCEEDED") {
        throw new Error(`Databricks SQL ended with state ${state}`);
      }
      return rowsFromStatement(payload);
    },
  };
}
