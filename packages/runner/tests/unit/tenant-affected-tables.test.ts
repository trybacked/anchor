import { describe, expect, it } from "vitest";
import {
    DOCUMENT_CHUNKS_TABLE,
    DOCUMENT_ENTITIES_TABLE,
    DOCUMENT_LINES_TABLE,
    documentTypeTableName,
} from "@backed/core";
import type { DocumentCatalog, ProfileReport } from "@backed/core";
import { resolveTenantAffectedTables } from "../../src/tenant-affected-tables.js";

function profileEntry(table: string, sourceFile: string): ProfileReport[number] {
    return {
        table,
        sourceFile,
        rowCount: 1,
        columns: [],
    };
}

describe("resolveTenantAffectedTables", () => {
    it("includes structured tables from unknown files only", () => {
        const profile: ProfileReport = [
            profileEntry("customers", "customers.csv"),
            profileEntry("orders", "orders.csv"),
        ];
        const affected = resolveTenantAffectedTables(profile, ["orders.csv"]);
        expect(affected).toEqual(new Set(["orders"]));
    });

    it("excludes pipeline infrastructure tables", () => {
        const profile: ProfileReport = [
            profileEntry(DOCUMENT_LINES_TABLE, "document-catalog:lines"),
            profileEntry(DOCUMENT_CHUNKS_TABLE, "document-catalog:chunks"),
            profileEntry(DOCUMENT_ENTITIES_TABLE, "document-catalog:entities"),
        ];
        const affected = resolveTenantAffectedTables(profile, ["new.pdf"]);
        expect(affected.size).toBe(0);
    });

    it("includes document type tables touched by unknown files", () => {
        const publicationTable = documentTypeTableName("publication");
        const profile: ProfileReport = [
            profileEntry(publicationTable, "document-catalog:publication"),
            profileEntry(DOCUMENT_LINES_TABLE, "document-catalog:lines"),
        ];
        const catalog: DocumentCatalog = {
            runId: "run-1",
            generatedAt: new Date().toISOString(),
            documents: [{
                sourceTable: "doc_new_file",
                sourceFile: "new.pdf",
                documentType: "publication",
                documentTypeLabel: "Publication",
                confidence: 0.9,
                pageCount: 2,
            }],
            documentTypes: [{
                id: "publication",
                name: "Publication",
                tableName: publicationTable,
                documentCount: 1,
                confidence: 0.9,
                sampleSourceTables: ["doc_new_file"],
            }],
        };
        const affected = resolveTenantAffectedTables(profile, ["new.pdf"], catalog);
        expect(affected).toEqual(new Set([publicationTable]));
    });

    it("does not mark unrelated document types as affected", () => {
        const publicationTable = documentTypeTableName("publication");
        const noticeTable = documentTypeTableName("notice");
        const profile: ProfileReport = [
            profileEntry(publicationTable, "document-catalog:publication"),
            profileEntry(noticeTable, "document-catalog:notice"),
        ];
        const catalog: DocumentCatalog = {
            runId: "run-1",
            generatedAt: new Date().toISOString(),
            documents: [{
                sourceTable: "doc_notice_new",
                sourceFile: "notice-new.pdf",
                documentType: "notice",
                documentTypeLabel: "Notice",
                confidence: 0.9,
                pageCount: 1,
            }],
            documentTypes: [{
                id: "notice",
                name: "Notice",
                tableName: noticeTable,
                documentCount: 1,
                confidence: 0.9,
                sampleSourceTables: ["doc_notice_new"],
            }],
        };
        const affected = resolveTenantAffectedTables(profile, ["notice-new.pdf"], catalog);
        expect(affected).toEqual(new Set([noticeTable]));
        expect(affected.has(publicationTable)).toBe(false);
    });
});
