import { loadWorkerServiceConfig } from "./config.js";
import { FileRunStore } from "./run-store-fs.js";
import { startWorkerService } from "./server.js";

async function main(): Promise<void> {
  const config = loadWorkerServiceConfig();
  const runStore = new FileRunStore(config.dataRoot);
  await runStore.init();
  const service = await startWorkerService({ config, runStore });
  console.log(
    JSON.stringify({
      event: "server.started",
      ts: new Date().toISOString(),
      message: `Worker service listening on ${service.url}`,
    }),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({
      event: "server.error",
      ts: new Date().toISOString(),
      message,
    }),
  );
  process.exitCode = 1;
});
