import {
    ProfileReportSchema,
    readModelYaml,
    readRunArtifact,
} from "@backed/core";
import type { ProfileReport, SemanticModel } from "@backed/core";
import { affectedTablesFromProfileDiff, filterProfileToTables } from "@backed/diff";

export interface IncrementalScope {
    profileForInference: ProfileReport;
    incrementalTables: Set<string> | null;
    existingModel: SemanticModel | null;
}

export function resolveIncrementalScope(
    root: string,
    profile: ProfileReport,
    previousRunId: string | undefined,
    forceFull: boolean,
    hasDocuments: boolean,
): IncrementalScope {
    if (forceFull || hasDocuments || previousRunId === undefined) {
        return {
            profileForInference: profile,
            incrementalTables: null,
            existingModel: null,
        };
    }
    try {
        const existingModel = readModelYaml(root);
        const previousProfile = readRunArtifact(root, previousRunId, "profile", ProfileReportSchema);
        const incrementalTables = affectedTablesFromProfileDiff(previousProfile, profile);
        if (incrementalTables.size === 0) {
            return {
                profileForInference: profile,
                incrementalTables: null,
                existingModel: null,
            };
        }
        return {
            profileForInference: filterProfileToTables(profile, incrementalTables),
            incrementalTables,
            existingModel,
        };
    }
    catch {
        return {
            profileForInference: profile,
            incrementalTables: null,
            existingModel: null,
        };
    }
}
