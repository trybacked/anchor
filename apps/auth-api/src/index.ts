import { BIND_HOST, DEFAULT_PORT } from "./constants.js";
import { logInfo } from "./logger.js";
import { startAuthApi } from "./server.js";

async function main(): Promise<void> {
  const service = await startAuthApi({ port: DEFAULT_PORT, host: BIND_HOST });
  logInfo("auth.server.started", { url: service.url });

  const shutdown = async (signal: string): Promise<void> => {
    logInfo("auth.server.shutdown", { signal });
    try {
      await service.close();
      logInfo("auth.server.stopped", {});
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logInfo("auth.server.shutdown_error", { message });
      process.exitCode = 1;
    }
  };

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logInfo("auth.server.error", { message });
  process.exitCode = 1;
});
