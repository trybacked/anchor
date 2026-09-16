import {
    ProfileReportSchema,
    readModelYaml,
    readRunArtifact,
} from "@backed/core";
import type { DocumentCatalog, ProfileReport, SemanticModel } from "@backed/core";
import { affectedTablesFromProfileDiff, filterProfileToTables } from "@backed/diff";
import { resolveTenantAffectedTables } from "../tenant-affected-tables.js";

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
    previousProfile?: ProfileReport,
    existingModelOverride?: SemanticModel,
    unknownSourceFiles?: string[],
    documentCatalog?: DocumentCatalog,
): IncrementalScope {
    const fullScope: IncrementalScope = {
        profileForInference: profile,
        incrementalTables: null,
        existingModel: null,
    };
    if (forceFull) {
        return fullScope;
    }
    try {
        const existingModel = existingModelOverride ?? readModelYaml(root);
        let baselineProfile = previousProfile;
        if (baselineProfile === undefined && previousRunId !== undefined) {
            baselineProfile = readRunArtifact(root, previousRunId, "profile", ProfileReportSchema);
        }
        if (baselineProfile === undefined) {
            return fullScope;
        }
        const incrementalTables = unknownSourceFiles !== undefined && unknownSourceFiles.length > 0
            ? resolveTenantAffectedTables(profile, unknownSourceFiles, documentCatalog)
            : affectedTablesFromProfileDiff(baselineProfile, profile);
        if (incrementalTables.size === 0) {
            return fullScope;
        }
        return {
            profileForInference: filterProfileToTables(profile, incrementalTables),
            incrementalTables,
            existingModel,
        };
    }
    catch {
        return fullScope;
    }
}
