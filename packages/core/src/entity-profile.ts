export const DEFAULT_PROFILE_MATCH_LIMIT = 3;
export const MAX_PROFILE_MATCH_LIMIT = 10;
const DEFAULT_PROFILE_RELATED_LIMIT = 15;
export const DEFAULT_PROFILE_FACT_LIMIT = DEFAULT_PROFILE_RELATED_LIMIT;
export const DEFAULT_PROFILE_DOCUMENT_LIMIT = DEFAULT_PROFILE_RELATED_LIMIT;
export const MAX_PROFILE_ROW_LIMIT = 100;
export interface EntityProfileRequest {
    name: string;
    matchLimit?: number | undefined;
    factLimit?: number | undefined;
    documentLimit?: number | undefined;
}
export interface EntityProfileResult {
    profile: Record<string, unknown>;
    documents: Record<string, unknown>[];
    facts: Record<string, unknown>[];
    attributedIdentifiers: Record<string, string[]>;
}
export type EntityProfileReader = (request: EntityProfileRequest) => Promise<EntityProfileResult[]>;
