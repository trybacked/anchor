import { loadWorkerServiceConfig } from "./config.js";
import { FileRunStore } from "./run-store-fs.js";
import { startWorkerService } from "./server.js";

async function main(): Promise<void> {
    const config = loadWorkerServiceConfig();
    const runStore = new FileRunStore(config.dataRoot);
    await runStore.init();
    const service = await startWorkerService({ config, runStore });
    console.log(`Worker service listening on ${service.url}`);
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
