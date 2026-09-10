import { spawn } from "node:child_process";
import { CLI_PATH, NODE_EXECUTABLE } from "./paths.js";

export interface CliRunResult {
    exitCode: number | null;
    stdout: string;
    stderr: string;
}

export function runCli(
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv = process.env,
    timeoutMs = 15_000,
): Promise<CliRunResult> {
    return new Promise((resolve, reject) => {
        const child = spawn(NODE_EXECUTABLE, [CLI_PATH, ...args], {
            cwd,
            env,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
            stdout += chunk;
        });
        child.stderr.on("data", (chunk: string) => {
            stderr += chunk;
        });
        const timer = setTimeout(() => {
            child.kill("SIGTERM");
            reject(new Error(`CLI timed out: backed ${args.join(" ")}`));
        }, timeoutMs);
        child.on("error", (error) => {
            clearTimeout(timer);
            reject(error);
        });
        child.on("exit", (exitCode) => {
            clearTimeout(timer);
            resolve({ exitCode, stdout, stderr });
        });
    });
}
