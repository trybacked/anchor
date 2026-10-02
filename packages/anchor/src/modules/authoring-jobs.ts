import type { TenantApiContext } from "../scope.js";
import type { Transport } from "../transport.js";

export function createAuthoringJobsModule(transport: Transport, ctx: TenantApiContext) {
  return {
    get: (jobId: string) =>
      transport.requestJson<{
        id: string;
        kind: string;
        status: string;
        error: string | null;
        result: Record<string, unknown> | null;
      }>("GET", ctx.url(`/v1/authoring/jobs/${encodeURIComponent(jobId)}`), {
        headers: ctx.headers,
      }),

    wait: async (
      jobId: string,
      options: { intervalMs?: number; timeoutMs?: number } = {},
    ): Promise<Record<string, unknown> | null> => {
      const intervalMs = options.intervalMs ?? 1500;
      const timeoutMs = options.timeoutMs ?? 120_000;
      const started = Date.now();
      for (;;) {
        const job = await createAuthoringJobsModule(transport, ctx).get(jobId);
        if (job.status === "completed") {
          return job.result;
        }
        if (job.status === "failed") {
          throw new Error(job.error ?? "Job failed");
        }
        if (Date.now() - started > timeoutMs) {
          throw new Error("Job wait timeout");
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    },
  };
}
