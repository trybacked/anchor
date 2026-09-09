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

export function findPositionalArg(args: string[]): string | undefined {
    return args.find((arg) => !isOptionArg(arg) && !arg.startsWith("-"));
}

export function hasInteractiveTerminal(): boolean {
    return process.stdin.isTTY;
}

/** Non-interactive init: no TTY, or explicit `-y` / `--yes`. */
export function wantsHeadlessInit(args: string[]): boolean {
    return !hasInteractiveTerminal()
        || hasFlag(args, FLAGS.YES)
        || hasFlag(args, FLAGS.YES_SHORT);
}

/** Non-interactive commands that only prompt when a TTY is present (review, gateway, login). */
export function wantsHeadlessCommand(): boolean {
    return !hasInteractiveTerminal();
}

export function commandErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function requireFlagValue(args: string[], index: number, flag: string): {
    value: string;
    nextIndex: number;
} {
    const value = args[index + 1];
    if (value === undefined || value.startsWith("-")) {
        throw new Error(`Missing value for ${flag}`);
    }
    return { value, nextIndex: index + 1 };
}

export function rejectUnknownFlag(flag: string): never {
    throw new Error(`Unknown flag: ${flag}`);
}

export function rejectUnexpectedArg(arg: string): never {
    throw new Error(`Unexpected argument: ${arg}`);
}

const INIT_FLAGS = new Set<string>([
    FLAGS.HELP,
    FLAGS.HELP_SHORT,
    FLAGS.YES,
    FLAGS.YES_SHORT,
    FLAGS.SOURCES,
    FLAGS.RULES,
]);

const MODEL_FLAGS = new Set<string>([
    FLAGS.HELP,
    FLAGS.HELP_SHORT,
    FLAGS.FULL,
    FLAGS.NO_EMBED,
]);

function assertOnlyKnownFlags(args: string[], allowed: Set<string>): void {
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === undefined || !arg.startsWith("-")) {
            continue;
        }
        if (isHelpFlag(arg)) {
            continue;
        }
        if (!allowed.has(arg)) {
            rejectUnknownFlag(arg);
        }
        if (readFlagValue(args, arg) !== undefined) {
            index += 1;
        }
    }
}

export interface InitArgs {
    help: boolean;
    sourcesDir?: string;
    rulesJson?: string;
}

export function parseInitArgs(args: string[]): InitArgs {
    assertOnlyKnownFlags(args, INIT_FLAGS);
    const positional = findPositionalArg(args);
    const sourcesDir = readFlagValue(args, FLAGS.SOURCES) ?? positional;
    const rulesJson = readFlagValue(args, FLAGS.RULES);
    return {
        help: args.some(isHelpFlag),
        ...(sourcesDir !== undefined ? { sourcesDir } : {}),
        ...(rulesJson !== undefined ? { rulesJson } : {}),
    };
}

export interface ModelArgs {
    help: boolean;
    forceFull: boolean;
    skipEmbed: boolean;
    sourcesDir?: string;
}

export function parseModelArgs(args: string[]): ModelArgs {
    assertOnlyKnownFlags(args, MODEL_FLAGS);
    const positional = findPositionalArg(args);
    return {
        help: args.some(isHelpFlag),
        forceFull: hasFlag(args, FLAGS.FULL),
        skipEmbed: hasFlag(args, FLAGS.NO_EMBED),
        ...(positional !== undefined ? { sourcesDir: positional } : {}),
    };
}
