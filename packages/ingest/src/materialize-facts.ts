import { DOCUMENT_FACTS_TABLE } from "@backed/core";
import { dropTableIfExists, quoteIdentifier, quoteString, sqlNullableNumber, sqlNullableString } from "./sql.js";
import type { Dataset, SqlQuery } from "./types.js";
export interface MaterializedFactInput {
    factId: string;
    documentId: string;
    entityId: string | null;
    identifierType: string | null;
    identifierValue: string | null;
    factType: string;
    amount: number | null;
    rawText: string;
    page: number;
    line: number;
}
export interface MaterializeFactsResult {
    datasetsAdded: Dataset[];
    factCount: number;
}
export async function materializeFacts(query: SqlQuery, facts: MaterializedFactInput[]): Promise<MaterializeFactsResult> {
    await dropTableIfExists(query, DOCUMENT_FACTS_TABLE);
    await query(`CREATE TABLE ${quoteIdentifier(DOCUMENT_FACTS_TABLE)} (
      fact_id VARCHAR NOT NULL,
      document_id VARCHAR NOT NULL,
      entity_id VARCHAR,
      identifier_type VARCHAR,
      identifier_value VARCHAR,
      fact_type VARCHAR NOT NULL,
      amount DOUBLE,
      raw_text VARCHAR NOT NULL,
      page INTEGER NOT NULL,
      line INTEGER NOT NULL
    )`);
    for (const fact of facts) {
        await query(`INSERT INTO ${quoteIdentifier(DOCUMENT_FACTS_TABLE)} (
        fact_id, document_id, entity_id, identifier_type, identifier_value,
        fact_type, amount, raw_text, page, line
      ) VALUES (
        ${quoteString(fact.factId)},
        ${quoteString(fact.documentId)},
        ${sqlNullableString(fact.entityId)},
        ${sqlNullableString(fact.identifierType)},
        ${sqlNullableString(fact.identifierValue)},
        ${quoteString(fact.factType)},
        ${sqlNullableNumber(fact.amount)},
        ${quoteString(fact.rawText)},
        ${String(fact.page)},
        ${String(fact.line)}
      )`);
    }
    const datasetsAdded: Dataset[] = [];
    if (facts.length > 0) {
        datasetsAdded.push({
            tableName: DOCUMENT_FACTS_TABLE,
            sourceFile: "document-facts:extracted",
            format: "json",
        });
    }
    return { datasetsAdded, factCount: facts.length };
}
