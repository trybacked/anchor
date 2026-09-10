import type { ProfileReport } from "@backed/core";
import { diffProfile, tableFromProfileChange } from "./profile-diff.js";

export function affectedTablesFromProfileDiff(previous: ProfileReport, next: ProfileReport): Set<string> {
    const affected = new Set<string>();
    for (const change of diffProfile(previous, next)) {
        const table = tableFromProfileChange(change);
        if (table !== undefined) {
            affected.add(table);
        }
    }
    return affected;
}

export function filterProfileToTables(profile: ProfileReport, tableNames: Set<string>): ProfileReport {
    return profile.filter((table) => tableNames.has(table.table));
}
