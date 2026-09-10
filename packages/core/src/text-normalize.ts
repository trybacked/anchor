export function normalizeComparableLine(line: string): string {
    return line.trim().toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ");
}
