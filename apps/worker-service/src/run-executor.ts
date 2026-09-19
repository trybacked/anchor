import {
  runTenantPipeline,
  TenantPipelineError,
  type TenantInputFile,
  type TenantPipelineConfigPatch,
} from "@backed/runner";
import type { WorkerServiceConfig } from "./config.js";
import { computeRunDurationMs, logRunCompleted, logRunFailed } from "./metrics.js";
import type { PartnerRegistry } from "./partner-registry.js";
import type { RunStore } from "./run-store.js";
import { notifyRunCompletedWebhook } from "./webhook.js";

export const ORPHANED_RUN_FAILURE_MESSAGE =
  "Run interrupted by worker restart (orphaned while running)";

export interface RunExecutorJob {
  tenantId: string;
  runId: string;
  partnerId: string | undefined;
  files: TenantInputFile[];
  config: TenantPipelineConfigPatch | undefined;
  skipEmbed: boolean;
}

export interface RunExecutorDeps {
  config: WorkerServiceConfig;
  runStore: RunStore;
  partnerRegistry: PartnerRegistry;
  webhookFetch?: typeof fetch;
  runPipeline?: typeof runTenantPipeline;
}

export interface RunExecutor {
  enqueue(job: RunExecutorJob): void;
  recoverOrphanedRuns(): number;
  shutdown(): Promise<void>;
}

export function createRunExecutor(deps: RunExecutorDeps): RunExecutor {
  const runPipeline = deps.runPipeline ?? runTenantPipeline;
  const maxConcurrent = deps.config.maxConcurrentRuns;
  const queue: RunExecutorJob[] = [];
  let inFlight = 0;
  let shuttingDown = false;
  const abortByRunId = new Map<string, AbortController>();
  let drainResolve: (() => void) | undefined;

  const maybeResolveDrain = (): void => {
    if (inFlight === 0 && queue.length === 0 && drainResolve !== undefined) {
      drainResolve();
      drainResolve = undefined;
    }
  };

  const finishRun = (
    job: RunExecutorJob,
    outcome:
      | { ok: true; result: Awaited<ReturnType<typeof runTenantPipeline>> }
      | { ok: false; error: unknown },
  ): void => {
    const partnerId = job.partnerId;
    if (outcome.ok) {
      const result = outcome.result;
      const record = deps.runStore.complete(job.tenantId, job.runId, result.stats, result.deletionEntry);
      if (partnerId !== undefined) {
        logRunCompleted({
          tenantId: job.tenantId,
          runId: job.runId,
          partnerId,
          durationMs: computeRunDurationMs(
            record?.startedAt ?? new Date().toISOString(),
            record?.finishedAt,
          ),
          skipped: result.skipped,
          deletionEntry: result.deletionEntry,
        });
        void notifyRunCompletedWebhook({
          config: deps.config,
          partnerRegistry: deps.partnerRegistry,
          partnerId,
          tenantId: job.tenantId,
          runId: job.runId,
          status: "done",
          skipped: result.skipped,
          deletionEntry: result.deletionEntry,
          ...(deps.webhookFetch !== undefined ? { fetchImpl: deps.webhookFetch } : {}),
        });
      }
      return;
    }
    const error = outcome.error;
    const deletionEntry = error instanceof TenantPipelineError ? error.deletionEntry : undefined;
    const failureMessage = error instanceof Error ? error.message : String(error);
    const existing = deps.runStore.get(job.tenantId, job.runId);
    const record = deps.runStore.fail(job.tenantId, job.runId, failureMessage, deletionEntry);
    if (partnerId !== undefined) {
      logRunFailed({
        tenantId: job.tenantId,
        runId: job.runId,
        partnerId,
        durationMs: computeRunDurationMs(
          record?.startedAt ?? existing?.startedAt ?? new Date().toISOString(),
          record?.finishedAt,
        ),
        failureMessage,
        ...(deletionEntry !== undefined ? { deletionEntry } : {}),
      });
      void notifyRunCompletedWebhook({
        config: deps.config,
        partnerRegistry: deps.partnerRegistry,
        partnerId,
        tenantId: job.tenantId,
        runId: job.runId,
        status: "failed",
        skipped: false,
        ...(deletionEntry !== undefined ? { deletionEntry } : {}),
        ...(deps.webhookFetch !== undefined ? { fetchImpl: deps.webhookFetch } : {}),
      });
    }
  };

  const runJob = async (job: RunExecutorJob, signal: AbortSignal): Promise<void> => {
    try {
      const result = await runPipeline({
        dataRoot: deps.config.dataRoot,
        tenantId: job.tenantId,
        runId: job.runId,
        files: job.files,
        skipEmbed: job.skipEmbed,
        signal,
        ...(job.config !== undefined ? { config: job.config } : {}),
      });
      finishRun(job, { ok: true, result });
    } catch (error) {
      finishRun(job, { ok: false, error });
    } finally {
      abortByRunId.delete(job.runId);
      inFlight -= 1;
      pump();
      maybeResolveDrain();
    }
  };

  const pump = (): void => {
    if (shuttingDown) {
      return;
    }
    while (inFlight < maxConcurrent && queue.length > 0) {
      const job = queue.shift();
      if (job === undefined) {
        break;
      }
      inFlight += 1;
      const controller = new AbortController();
      abortByRunId.set(job.runId, controller);
      void runJob(job, controller.signal);
    }
  };

  return {
    enqueue(job: RunExecutorJob): void {
      if (shuttingDown) {
        deps.runStore.fail(job.tenantId, job.runId, "Worker is shutting down");
        return;
      }
      queue.push(job);
      pump();
    },

    recoverOrphanedRuns(): number {
      let recovered = 0;
      for (const run of deps.runStore.listRunning()) {
        deps.runStore.fail(run.tenantId, run.runId, ORPHANED_RUN_FAILURE_MESSAGE);
        recovered += 1;
      }
      return recovered;
    },

    shutdown(): Promise<void> {
      shuttingDown = true;
      queue.length = 0;
      for (const controller of abortByRunId.values()) {
        controller.abort();
      }
      if (inFlight === 0) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          resolve();
        }, deps.config.shutdownDrainMs);
        drainResolve = (): void => {
          clearTimeout(timer);
          resolve();
        };
      });
    },
  };
}
