import type { ListFilesResponse, RefreshRun, UploadedFile } from "@trybacked/service";
import type { TenantApiContext } from "../scope.js";
import type { Transport } from "../transport.js";
export function createFilesModule(transport: Transport, ctx: TenantApiContext) {
  return {
    upload: async (
      file: Blob,
      options: {
        filename: string;
        folder?: string | undefined;
      },
    ): Promise<UploadedFile> => {
      const form = new FormData();
      form.append("file", file, options.filename);
      if (options.folder !== undefined && options.folder.length > 0) {
        form.append("folder", options.folder);
      }
      const response = await transport.requestRaw("POST", ctx.url("/v1/files"), {
        formData: form,
        headers: ctx.headers,
      });
      const payload: unknown = await response.json();
      return payload as UploadedFile;
    },
    list: (options?: { folder?: string | undefined }) => {
      const query =
        options?.folder !== undefined && options.folder.length > 0
          ? `?folder=${encodeURIComponent(options.folder)}`
          : "";
      return transport.requestJson<ListFilesResponse>("GET", ctx.url(`/v1/files${query}`), {
        headers: ctx.headers,
      });
    },
    delete: (path: string) =>
      transport.requestJson<{
        ok: true;
      }>("DELETE", ctx.url(`/v1/files?path=${encodeURIComponent(path)}`), { headers: ctx.headers }),
    refresh: (options?: { fullRefresh?: boolean | undefined }) =>
      transport.requestJson<RefreshRun>("POST", ctx.url("/v1/files/refresh"), {
        body: options?.fullRefresh === true ? { fullRefresh: true } : {},
        headers: ctx.headers,
      }),
    getRefresh: (runId: number) =>
      transport.requestJson<RefreshRun>("GET", ctx.url(`/v1/files/refresh/${String(runId)}`), {
        headers: ctx.headers,
      }),
    waitForRefresh: async (
      runId: number,
      options?: {
        intervalMs?: number | undefined;
        signal?: AbortSignal | undefined;
      },
    ): Promise<RefreshRun> => {
      const intervalMs = options?.intervalMs ?? 3000;
      for (;;) {
        if (options?.signal?.aborted === true) {
          throw new Error("waitForRefresh aborted");
        }
        const run = await transport.requestJson<RefreshRun>(
          "GET",
          ctx.url(`/v1/files/refresh/${String(runId)}`),
          { headers: ctx.headers },
        );
        if (run.status === "succeeded" || run.status === "failed" || run.status === "canceled") {
          return run;
        }
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, intervalMs);
          options?.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new Error("waitForRefresh aborted"));
            },
            { once: true },
          );
        });
      }
    },
  };
}
