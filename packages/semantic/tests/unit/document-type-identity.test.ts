import { describe, expect, it } from "vitest";
import type { DocumentCatalog, Entity } from "@backed/core";
import { documentTypeTableName } from "@backed/core";
import { buildDocumentCorpusEntities } from "../../src/document-ontology.js";
import { hashHeaderContent } from "../../src/document-sample-fingerprint.js";
import {
    documentTypeStableKey,
    stableKeyFromEntity,
} from "../../src/document-type-identity.js";
import { mergeIncrementalProposal } from "../../src/merge-proposal.js";

function catalogWithType(typeId: string, typeLabel: string, headerLines: string[]): DocumentCatalog {
    const tableName = documentTypeTableName(typeId);
    return {
        runId: "run-1",
        generatedAt: "2026-01-01T00:00:00.000Z",
        documentTypes: [{
            id: typeId,
            name: typeLabel,
            tableName,
            documentCount: 1,
            confidence: 0.9,
            sampleSourceTables: ["doc_a"],
        }],
        documents: [{
            sourceTable: "doc_a",
            sourceFile: "a.pdf",
            documentType: typeId,
            documentTypeLabel: typeLabel,
            confidence: 0.9,
            pageCount: 1,
            headerContentFingerprint: hashHeaderContent(headerLines),
        }],
    };
}

function columnProfile(name: string, sqlType: string) {
    return {
        name,
        sqlType,
        nullCount: 0,
        nullRatio: 0,
        distinctCount: 1,
        min: null,
        max: null,
        topValues: [],
        patterns: [],
        foreignKeyCandidates: [],
    };
}

function profileForCatalog(catalog: DocumentCatalog) {
    return catalog.documentTypes.map((type) => ({
        table: type.tableName,
        sourceFile: `document-catalog:${type.id}`,
        rowCount: type.documentCount,
        columns: [
            columnProfile("document_id", "VARCHAR"),
            columnProfile("source_file", "VARCHAR"),
            columnProfile("page_count", "INTEGER"),
        ],
    }));
}

describe("document type stable identity", () => {
    it("uses documentType slug for entity ids regardless of header fingerprint", () => {
        const coldHeader = ["Cold header", "Publication"];
        const incrementalHeader = ["Different recurring context", "Other boilerplate", "Publication"];
        const coldCatalog = catalogWithType("publication", "Publication", coldHeader);
        const incrementalCatalog = catalogWithType("publication", "Publication", incrementalHeader);
        const coldEntity = buildDocumentCorpusEntities(coldCatalog, profileForCatalog(coldCatalog))
            .find((entity) => entity.sourceTable === documentTypeTableName("publication"));
        const incrementalEntity = buildDocumentCorpusEntities(incrementalCatalog, profileForCatalog(incrementalCatalog))
            .find((entity) => entity.sourceTable === documentTypeTableName("publication"));
        expect(coldEntity?.id).toBe("dtype_publication");
        expect(incrementalEntity?.id).toBe("dtype_publication");
        expect(coldCatalog.documents[0]?.headerContentFingerprint)
            .not.toBe(incrementalCatalog.documents[0]?.headerContentFingerprint);
    });

    it("maps legacy fingerprint ids back to document type via source table during merge", () => {
        const catalog = catalogWithType("publication", "Published act", ["Header"]);
        const profile = profileForCatalog(catalog);
        const freshEntity = buildDocumentCorpusEntities(catalog, profile)
            .find((entity) => entity.sourceTable === documentTypeTableName("publication"))!;
        const existingEntity: Entity = {
            ...freshEntity,
            id: "dtype_05cc44a8deadbeef",
            name: "Publication",
            status: "confirmed",
            provenance: {
                table: freshEntity.sourceTable,
                evidence: "legacy entity without stable-key marker",
            },
        };
        const merged = mergeIncrementalProposal(
            {
                runId: "run-2",
                generatedAt: "2026-01-02T00:00:00.000Z",
                entities: [freshEntity],
                relations: [],
                rules: [],
                doubts: [],
                questions: [],
            },
            {
                metadata: {
                    formatVersion: "1",
                    runId: "run-1",
                    generatedAt: "2026-01-01T00:00:00.000Z",
                },
                entities: [existingEntity],
                relations: [],
                rules: [],
            },
            new Set([freshEntity.sourceTable]),
            profile,
        );
        expect(merged.entities).toHaveLength(1);
        expect(merged.entities[0]?.id).toBe("dtype_05cc44a8deadbeef");
        expect(merged.entities[0]?.status).toBe("confirmed");
        expect(stableKeyFromEntity(merged.entities[0]!)).toBe(documentTypeStableKey("publication"));
    });
});
