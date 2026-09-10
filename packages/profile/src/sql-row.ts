export function toCount(value: unknown): number {
    const count = Number(value);
    if (!Number.isSafeInteger(count) || count < 0) {
        throw new Error(`Invalid SQL count: ${JSON.stringify(value)}`);
    }
    return count;
}

export function toNullableString(value: unknown): string | null {
    if (value === null || value === undefined) {
        return null;
    }
    return typeof value === "string" ? value : JSON.stringify(value);
}

export function roundScore(value: number, decimalPlaces: number): number {
    return Number(value.toFixed(decimalPlaces));
}
