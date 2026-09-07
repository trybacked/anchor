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
