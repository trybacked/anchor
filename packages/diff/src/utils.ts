import type { DiffChange } from "@backed/core";

export function indexByKey<T>(items: T[], key: (item: T) => string): Map<string, T> {
    return new Map(items.map((item) => [key(item), item]));
}

export function collectAddedRemoved<T>(
    previous: Map<string, T>,
    next: Map<string, T>,
    onAdded: (id: string, item: T) => DiffChange,
    onRemoved: (id: string, item: T) => DiffChange,
): DiffChange[] {
    const changes: DiffChange[] = [];
    for (const [id, item] of next) {
        if (!previous.has(id)) {
            changes.push(onAdded(id, item));
        }
    }
    for (const [id, item] of previous) {
        if (!next.has(id)) {
            changes.push(onRemoved(id, item));
        }
    }
    return changes;
}

export function collectAdded<T>(
    previous: Map<string, T>,
    next: Map<string, T>,
    onAdded: (id: string, item: T) => DiffChange,
): DiffChange[] {
    const changes: DiffChange[] = [];
    for (const [id, item] of next) {
        if (!previous.has(id)) {
            changes.push(onAdded(id, item));
        }
    }
    return changes;
}
