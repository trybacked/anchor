import type { CommandHandler } from "../types.js";

const NOT_IMPLEMENTED = "Non implementato — Fase 1 in corso.";

function stubCommand(name: string): CommandHandler {
  return async () => {
    console.error(`backed ${name}: ${NOT_IMPLEMENTED}`);
    process.exitCode = 1;
  };
}

export const initCommand: CommandHandler = stubCommand("init");
export const modelCommand: CommandHandler = stubCommand("model");
export const reviewCommand: CommandHandler = stubCommand("review");
export const diffCommand: CommandHandler = stubCommand("diff");
export const serveCommand: CommandHandler = stubCommand("serve");
