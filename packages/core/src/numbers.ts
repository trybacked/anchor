import type { NumberFormat } from "./domain.js";
export function parseLocalizedNumber(raw: string, format: NumberFormat): number | null {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
        return null;
    }
    const [groupSeparator, decimalSeparator] = format === "decimal_comma" ? [".", ","] : [",", "."];
    const normalized = trimmed
        .split(groupSeparator)
        .join("")
        .replace(decimalSeparator, ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}
