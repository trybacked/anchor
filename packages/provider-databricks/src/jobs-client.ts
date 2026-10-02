import type { DatabricksProviderConfig } from "./config.js";

function apiBaseUrl(host: string): string {
  return `https://${host}`;
}

export type DatabricksJobRunState =
  | "PENDING"
  | "RUNNING"
  | "TERMINATING"
  | "TERMINATED"
  | "SKIPPED"
  | "INTERNAL_ERROR"
  | "BLOCKED"
  | "WAITING_FOR_RETRY"
  | "QUEUED";

export type DatabricksJobRunResult = {
  runId: number;
  state: DatabricksJobRunState;
  resultState?: "SUCCESS" | "FAILED" | "TIMEDOUT" | "CANCELED" | undefined;
  stateMessage?: string | undefined;
};

export type DatabricksJobsClient = {
  findJobIdByName: (name: string) => Promise<number | null>;
  runNow: (
    jobId: number,
    options?: { fullRefresh?: boolean | undefined },
  ) => Promise<{ runId: number }>;
  getRun: (runId: number) => Promise<DatabricksJobRunResult>;
};

export function createDatabricksJobsClient(config: DatabricksProviderConfig): DatabricksJobsClient {
  const base = `${apiBaseUrl(config.host)}/api/2.1/jobs`;
  const headers = (): Record<string, string> => ({
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
  });

  return {
    findJobIdByName: async (name) => {
      const url = `${base}/list?name=${encodeURIComponent(name)}`;
      const response = await fetch(url, { headers: headers() });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Databricks jobs list ${String(response.status)}: ${body.slice(0, 240)}`);
      }
      const payload = (await response.json()) as {
        jobs?: Array<{ job_id?: number; settings?: { name?: string } }>;
      };
      const jobs = payload.jobs ?? [];
      for (const job of jobs) {
        if (job.settings?.name === name && job.job_id !== undefined) {
          return job.job_id;
        }
      }
      return null;
    },

    runNow: async (jobId, options) => {
      const body: Record<string, unknown> = { job_id: jobId };
      if (options?.fullRefresh === true) {
        body.pipeline_params = { full_refresh: true };
      }
      const response = await fetch(`${base}/run-now`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Databricks run-now ${String(response.status)}: ${text.slice(0, 240)}`);
      }
      const payload = (await response.json()) as { run_id?: number };
      if (payload.run_id === undefined) {
        throw new Error("Databricks run-now response missing run_id");
      }
      return { runId: payload.run_id };
    },

    getRun: async (runId) => {
      const url = `${base}/runs/get?run_id=${String(runId)}`;
      const response = await fetch(url, { headers: headers() });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Databricks runs/get ${String(response.status)}: ${text.slice(0, 240)}`);
      }
      const payload = (await response.json()) as {
        run_id?: number;
        state?: {
          life_cycle_state?: DatabricksJobRunState;
          result_state?: DatabricksJobRunResult["resultState"];
          state_message?: string;
        };
      };
      const state = payload.state?.life_cycle_state ?? "PENDING";
      return {
        runId: payload.run_id ?? runId,
        state,
        ...(payload.state?.result_state !== undefined
          ? { resultState: payload.state.result_state }
          : {}),
        ...(payload.state?.state_message !== undefined && payload.state.state_message.length > 0
          ? { stateMessage: payload.state.state_message }
          : {}),
      };
    },
  };
}
