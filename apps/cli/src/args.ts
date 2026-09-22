import { FLAGS, isHelpFlag, isOptionArg } from "./config.js";

export function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (value === undefined || isOptionArg(value)) {
    return undefined;
  }
  return value;
}

export function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

export function hasInteractiveTerminal(): boolean {
  return process.stdin.isTTY;
}

/** Non-interactive commands that only prompt when a TTY is present (review). */
export function wantsHeadlessCommand(): boolean {
  return !hasInteractiveTerminal();
}

export function commandErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function rejectUnknownFlag(flag: string): never {
  throw new Error(`Unknown flag: ${flag}`);
}

const HELP_ONLY_FLAGS = new Set<string>([FLAGS.HELP, FLAGS.HELP_SHORT]);

const DIFF_FLAGS = new Set<string>([FLAGS.HELP, FLAGS.HELP_SHORT, FLAGS.ONTOLOGY]);

function assertOnlyKnownFlags(args: string[], allowed: Set<string>): void {
  for (const arg of args) {
    if (arg.startsWith("-") && !allowed.has(arg)) {
      rejectUnknownFlag(arg);
    }
  }
}

export interface HelpArgs {
  help: boolean;
}

export function parseHelpOnlyArgs(args: string[]): HelpArgs {
  assertOnlyKnownFlags(args, HELP_ONLY_FLAGS);
  return { help: args.some(isHelpFlag) };
}

export interface DiffArgs {
  help: boolean;
  ontology: boolean;
}

export function parseDiffArgs(args: string[]): DiffArgs {
  assertOnlyKnownFlags(args, DIFF_FLAGS);
  return {
    help: args.some(isHelpFlag),
    ontology: hasFlag(args, FLAGS.ONTOLOGY),
  };
}
