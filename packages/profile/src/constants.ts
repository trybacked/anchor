export const DATE_TYPE_PATTERN = /^(DATE|TIMESTAMP)/;
export const FRACTIONAL_TYPE_PATTERN = /^(DOUBLE|FLOAT|DECIMAL)/;
export const VARCHAR_TYPE_PREFIX = "VARCHAR";
export const FULL_PATTERN_MATCH_RATIO = 1;

export const FK_COLUMN_NAME_PATTERN = /(^id$|_id$|_code$|^codice|^ref_)/i;
export const FK_COLUMN_SUFFIX_PATTERN = /_id$|_code$/;
export const ID_COLUMN_NAME = "id";

export const FK_DISTINCT_RATIO_THRESHOLD = 0.5;
export const FK_ENRICHMENT_MAX_TABLES = 50;
export const FK_ALIGNMENT_STRONG = 1;
export const FK_ALIGNMENT_ID_MATCH = 0.95;
export const FK_ALIGNMENT_BASE = 0.85;
export const FK_SCORE_DECIMAL_PLACES = 3;
