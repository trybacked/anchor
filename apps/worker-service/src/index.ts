import { loadWorkerServiceConfig } from "./config.js";
import { startWorkerService } from "./server.js";

async function main(): Promise<void> {
    const config = loadWorkerServiceConfig();
    const service = await startWorkerService({ config });
    console.log(`Worker service listening on ${service.url}`);
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
