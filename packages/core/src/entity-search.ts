import { DOCUMENT_ENTITIES_TABLE, ENTITY_PROFILES_TABLE } from "./tables.js";
import { DEFAULT_SEARCH_MIN_SCORE } from "./constants.js";
export const INDEXED_ONTOLOGY_TABLES = [ENTITY_PROFILES_TABLE, DOCUMENT_ENTITIES_TABLE] as const;
const INDEXED_ONTOLOGY_TABLE_SET = new Set<string>(INDEXED_ONTOLOGY_TABLES);
export function isIndexedOntologyTable(sourceTable: string): boolean {
    return INDEXED_ONTOLOGY_TABLE_SET.has(sourceTable);
}
export const DEFAULT_ENTITY_SEARCH_LIMIT = 10;
export const MAX_ENTITY_SEARCH_LIMIT = 50;
export const DEFAULT_ENTITY_SEARCH_MIN_SCORE = DEFAULT_SEARCH_MIN_SCORE;
export type EntitySearchMode = "keyword" | "semantic" | "hybrid";
export interface EntitySearchRequest {
    query: string;
    mode?: EntitySearchMode;
    sourceTable?: string;
    limit: number;
    minScore?: number;
}
export type EntitySearcher = (request: EntitySearchRequest) => Promise<Record<string, unknown>[]>;
