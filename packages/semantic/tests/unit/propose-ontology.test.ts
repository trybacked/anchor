import { describe, expect, it, vi } from "vitest";
import type { DocumentCatalog } from "@backed/core";
import { runBurst } from "../../src/burst.js";
import { LLM_SCHEMA_NAMES } from "../../src/constants.js";
import {
    runOntologyStrategy,
    shouldSplitOntologyBurst,
} from "../../src/propose-ontology.js";

vi.mock("../../src/burst.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../src/burst.js")>()),
    runBurst: vi.fn(),
}));

const mockedRunBurst = vi.mocked(runBurst);
const mockModels = {
    language: {} as never,
    embedding: {} as never,
};

function tableProfile(name: string) {
    return {
        table: name,
        sourceFile: `${name}.csv`,
        rowCount: 10,
        columns: [{
            name: "id",
            sqlType: "VARCHAR",
            nullCount: 0,
            nullRatio: 0,
            distinctCount: 10,
            min: null,
            max: null,
            topValues: [],
            patterns: [],
            foreignKeyCandidates: [],
        }],
    };
}

function documentCatalog(typeCount: number): DocumentCatalog {
    const documentTypes = Array.from({ length: typeCount }, (_, index) => ({
        id: `type_${String(index)}`,
        name: `Type ${String(index)}`,
        tableName: `doc_type_${String(index)}`,
        documentCount: 1,
        confidence: 0.9,
        sampleSourceTables: [`doc_${String(index)}`],
    }));
    return {
        runId: "run-1",
        generatedAt: "2026-01-01T00:00:00.000Z",
        documentTypes,
        documents: documentTypes.map((type, index) => ({
            sourceTable: `doc_${String(index)}`,
            documentType: type.id,
            documentTypeLabel: type.name,
            confidence: 0.9,
            pageCount: 1,
        })),
    };
}

describe("shouldSplitOntologyBurst", () => {
    it("splits when structured tables or document types exceed thresholds", () => {
        expect(shouldSplitOntologyBurst([tableProfile("a"), tableProfile("b")])).toBe(true);
        expect(shouldSplitOntologyBurst([tableProfile("a")], documentCatalog(4))).toBe(true);
        expect(shouldSplitOntologyBurst([tableProfile("a")], documentCatalog(3))).toBe(false);
    });
});

describe("runOntologyStrategy split ontology", () => {
    it("runs entities and relations as separate LLM passes for large mixed corpora", async () => {
        mockedRunBurst.mockReset();
        mockedRunBurst
            .mockResolvedValueOnce({
                output: {
                    entities: [{
                        id: "protocol_record",
                        name: "Protocol record",
                        description: "Index table",
                        sourceTable: "atti_albo",
                        confidence: 0.95,
                        evidence: "Structured CSV index",
                    }],
                    doubts: [],
                },
                usage: { inputTokens: 10, outputTokens: 5, costUsd: null },
            })
            .mockResolvedValueOnce({
                output: {
                    relations: [],
                    rules: [],
                    doubts: [],
                },
                usage: { inputTokens: 8, outputTokens: 4, costUsd: null },
            });

        const result = await runOntologyStrategy(
            {
                kind: "llm-with-catalog",
                tables: [tableProfile("atti_albo"), tableProfile("enti_extract")],
                catalog: documentCatalog(6),
            },
            mockModels,
            { tables: [] },
            60_000,
            undefined,
        );

        expect(mockedRunBurst).toHaveBeenCalledTimes(2);
        expect(mockedRunBurst.mock.calls[0]?.[0].schemaName).toBe(LLM_SCHEMA_NAMES.ontologyEntities);
        expect(mockedRunBurst.mock.calls[1]?.[0].schemaName).toBe(LLM_SCHEMA_NAMES.ontologyRelations);
        expect(result.output.entities).toHaveLength(1);
        expect(result.output.relations).toHaveLength(0);
    });

    it("keeps a single ontology pass for small tabular workspaces", async () => {
        mockedRunBurst.mockReset();
        mockedRunBurst.mockResolvedValueOnce({
            output: {
                entities: [{
                    id: "customer",
                    name: "Customer",
                    description: "Customer table",
                    sourceTable: "customers",
                    confidence: 0.95,
                    evidence: "Primary key on id",
                }],
                relations: [],
                rules: [],
                doubts: [],
            },
            usage: { inputTokens: 5, outputTokens: 3, costUsd: null },
        });

        await runOntologyStrategy(
            {
                kind: "llm-full",
                tables: [tableProfile("customers")],
            },
            mockModels,
            { tables: [] },
            60_000,
            undefined,
        );

        expect(mockedRunBurst).toHaveBeenCalledTimes(1);
        expect(mockedRunBurst.mock.calls[0]?.[0].schemaName).toBe(LLM_SCHEMA_NAMES.ontologyProposal);
    });
});
