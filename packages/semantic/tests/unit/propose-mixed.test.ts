import { describe, expect, it, vi } from "vitest";

import type { DocumentCatalog, ProfileReport } from "@backed/core";
import { documentTypeTableName } from "@backed/core";

import { runBurst } from "../../src/burst.js";
import { proposeModel } from "../../src/propose.js";

vi.mock("../../src/burst.js", () => ({
  runBurst: vi.fn(),
}));

const mockedRunBurst = vi.mocked(runBurst);

const mockModels = {
  language: {} as never,
  embedding: {} as never,
};

function columnProfile(name: string, sqlType: string) {
  return {
    name,
    sqlType,
    nullCount: 0,
    nullRatio: 0,
    distinctCount: 2,
    min: null,
    max: null,
    topValues: [],
    patterns: [],
    foreignKeyCandidates: [],
  };
}

function tableProfile(table: string, columns: string[]): ProfileReport[number] {
  return {
    table,
    sourceFile: `${table}.csv`,
    rowCount: 2,
    columns: columns.map((column) => columnProfile(column, "VARCHAR")),
  };
}

const noticeTable = documentTypeTableName("notice");
const determinationTable = documentTypeTableName("determination");

const mixedProfile: ProfileReport = [
  tableProfile("customers", ["id", "name", "vat_number"]),
  tableProfile("invoices", ["id", "customer_id", "amount", "protocol_number"]),
  tableProfile(noticeTable, [
    "document_id",
    "source_file",
    "protocol_number",
    "published_date",
    "subject",
    "issuing_office",
    "page_count",
  ]),
  tableProfile(determinationTable, [
    "document_id",
    "source_file",
    "protocol_number",
    "published_date",
    "subject",
    "issuing_office",
    "page_count",
  ]),
  tableProfile("document_lines", ["document_id", "page", "line", "text"]),
  tableProfile("document_chunks", [
    "document_id",
    "chunk_index",
    "page_start",
    "page_end",
    "text",
  ]),
];

const mixedDocumentCatalog: DocumentCatalog = {
  runId: "test-run",
  generatedAt: "2026-09-05T10:00:00.000Z",
  documentTypes: [
    {
      id: "notice",
      name: "Notice",
      tableName: noticeTable,
      documentCount: 2,
      confidence: 0.9,
      sampleSourceTables: ["notice_alpha", "notice_beta"],
    },
    {
      id: "determination",
      name: "Determination",
      tableName: determinationTable,
      documentCount: 2,
      confidence: 0.9,
      sampleSourceTables: ["determination_one", "determination_two"],
    },
  ],
  documents: [
    {
      sourceTable: "notice_alpha",
      documentType: "notice",
      documentTypeLabel: "Notice",
      confidence: 0.9,
      pageCount: 1,
    },
    {
      sourceTable: "notice_beta",
      documentType: "notice",
      documentTypeLabel: "Notice",
      confidence: 0.9,
      pageCount: 1,
    },
    {
      sourceTable: "determination_one",
      documentType: "determination",
      documentTypeLabel: "Determination",
      confidence: 0.9,
      pageCount: 1,
    },
    {
      sourceTable: "determination_two",
      documentType: "determination",
      documentTypeLabel: "Determination",
      confidence: 0.9,
      pageCount: 1,
    },
  ],
};

describe("proposeModel mixed folder", () => {
  it("returns structured and document-type entities when a document catalog is present", async () => {
    mockedRunBurst.mockImplementation(async (request) => {
      if (request.schemaName.startsWith("column_classification")) {
        return {
          output: {
            tables: [
              {
                table: "customers",
                columns: [
                  {
                    column: "id",
                    label: "Customer ID",
                    semanticType: "identifier",
                    role: "primary_key",
                    confidence: 0.95,
                  },
                  {
                    column: "name",
                    label: "Name",
                    semanticType: "text",
                    role: "attribute",
                    confidence: 0.95,
                  },
                  {
                    column: "vat_number",
                    label: "VAT number",
                    semanticType: "vat_number",
                    role: "attribute",
                    confidence: 0.95,
                  },
                ],
              },
              {
                table: "invoices",
                columns: [
                  {
                    column: "id",
                    label: "Invoice ID",
                    semanticType: "identifier",
                    role: "primary_key",
                    confidence: 0.95,
                  },
                  {
                    column: "customer_id",
                    label: "Customer ID",
                    semanticType: "identifier",
                    role: "foreign_key",
                    confidence: 0.9,
                  },
                  {
                    column: "amount",
                    label: "Amount",
                    semanticType: "amount",
                    role: "attribute",
                    confidence: 0.95,
                  },
                  {
                    column: "protocol_number",
                    label: "Protocol number",
                    semanticType: "identifier",
                    role: "attribute",
                    confidence: 0.9,
                  },
                ],
              },
            ],
          },
          usage: { inputTokens: 10, outputTokens: 5, costUsd: null },
        };
      }

      return {
        output: {
          entities: [
            {
              id: "customer",
              name: "Customer",
              description: "Business customer",
              sourceTable: "customers",
              confidence: 0.95,
              evidence: "Candidate key on id with identity columns",
            },
            {
              id: "invoice",
              name: "Invoice",
              description: "Customer invoice",
              sourceTable: "invoices",
              confidence: 0.95,
              evidence: "Invoice amounts and customer foreign key",
            },
            {
              id: "notice",
              name: "Notice",
              description: "Should be dropped",
              sourceTable: noticeTable,
              confidence: 0.5,
              evidence: "Duplicate document entity from LLM",
            },
          ],
          relations: [],
          rules: [],
          doubts: [],
        },
        usage: { inputTokens: 20, outputTokens: 10, costUsd: null },
      };
    });

    const proposal = await proposeModel({
      profile: mixedProfile,
      runId: "test-run",
      models: mockModels,
      documentCatalog: mixedDocumentCatalog,
      now: new Date("2026-09-05T10:00:00.000Z"),
    });

    expect(proposal.entities.some((entity) => entity.sourceTable === "customers")).toBe(true);
    expect(proposal.entities.some((entity) => entity.sourceTable === "invoices")).toBe(true);
    expect(proposal.entities.some((entity) => entity.sourceTable === noticeTable)).toBe(true);
    expect(proposal.entities.some((entity) => entity.sourceTable === determinationTable)).toBe(
      true,
    );
    expect(proposal.entities.some((entity) => entity.sourceTable === noticeTable && entity.id === "notice")).toBe(true);
    expect(
      proposal.doubts.some((doubt) => doubt.topic.includes("entity notice") && doubt.reason.includes("duplicate document entity")),
    ).toBe(true);

    const classificationCalls = mockedRunBurst.mock.calls.filter(([request]) =>
      request.schemaName.startsWith("column_classification"),
    );
    expect(classificationCalls).toHaveLength(1);
    expect(classificationCalls[0]?.[0].prompt).not.toContain(noticeTable);
    expect(classificationCalls[0]?.[0].prompt).not.toContain(determinationTable);
  });

  it("skips column classification LLM when profile has only materialized document tables", async () => {
    mockedRunBurst.mockClear();

    const documentOnlyProfile: ProfileReport = mixedProfile.filter(
      (table) =>
        table.table.startsWith("doc_") ||
        table.table === "document_lines" ||
        table.table === "document_chunks",
    );

    const proposal = await proposeModel({
      profile: documentOnlyProfile,
      runId: "test-run",
      models: mockModels,
      documentCatalog: mixedDocumentCatalog,
      now: new Date("2026-09-05T10:00:00.000Z"),
    });

    const classificationCalls = mockedRunBurst.mock.calls.filter(([request]) =>
      request.schemaName.startsWith("column_classification"),
    );
    expect(classificationCalls).toHaveLength(0);
    expect(proposal.entities.some((entity) => entity.sourceTable === noticeTable)).toBe(true);
    expect(proposal.entities.some((entity) => entity.sourceTable === "customers")).toBe(false);
  });
});
