import { documentTypeTableName } from "@backed/core";
export const DOCUMENT_TYPE_TABLE_PREFIX = documentTypeTableName("").slice(0, 4);
export const DOCUMENT_TYPE_TABLE_LIKE = `${DOCUMENT_TYPE_TABLE_PREFIX}%`;
