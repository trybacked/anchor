import { NATIVE_FRACTIONAL_TYPE_PATTERN } from "@backed/core";

export { NATIVE_FRACTIONAL_TYPE_PATTERN };
export const NATIVE_DATE_TYPE_PATTERN = /^(DATE|TIMESTAMP)/;
export const VARCHAR_TYPE_PREFIX = "VARCHAR";

export const FK_COLUMN_NAME_PATTERN = /(^id$|_id$|_code$|^codice|^ref_)/i;
export const FK_COLUMN_SUFFIX_PATTERN = /_id$|_code$/;
export const ID_COLUMN_NAME = "id";

export const FK_DISTINCT_RATIO_THRESHOLD = 0.5;
export const FK_ENRICHMENT_MAX_TABLES = 50;
export const FK_ALIGNMENT_STRONG = 1;
export const FK_ALIGNMENT_ID_MATCH = 0.95;
export const FK_ALIGNMENT_BASE = 0.85;
export const FK_SCORE_DECIMAL_PLACES = 3;

export function isNativeDateColumnType(sqlType: string): boolean {
    return NATIVE_DATE_TYPE_PATTERN.test(sqlType);
}

export function isNativeFractionalColumnType(sqlType: string): boolean {
    return NATIVE_FRACTIONAL_TYPE_PATTERN.test(sqlType);
}

export function isStringColumnType(sqlType: string): boolean {
    return sqlType.startsWith(VARCHAR_TYPE_PREFIX);
}
