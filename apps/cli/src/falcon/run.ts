import { spawn } from "node:child_process";
import { resolveFalconLaunch } from "./resolve.js";

/** Run Falcon CLI with forwarded args; returns child exit code (0 default). */
export function runFalconDelegate(
  falconArgs: string[],
  options: { env?: NodeJS.ProcessEnv; cwd?: string } = {},
): Promise<number> {
  const launch = resolveFalconLaunch(options.env ?? process.env, options.cwd ?? process.cwd());
  const env = launch.env ?? options.env ?? process.env;
  const cwd = launch.cwd ?? options.cwd;

  return new Promise((resolvePromise, reject) => {
    const child = spawn(launch.command, [...launch.args, ...falconArgs], {
      stdio: "inherit",
      env,
      ...(cwd !== undefined ? { cwd } : {}),
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("exit", (code, signal) => {
      if (signal !== null) {
        resolvePromise(128 + (signal === "SIGINT" ? 2 : 1));
        return;
      }
      resolvePromise(code ?? 0);
    });
  });
}
