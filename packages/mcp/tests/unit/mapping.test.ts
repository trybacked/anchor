import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOOL_NAMES } from "../../src/constants.js";
import { entityNotFoundMessage } from "../../src/errors.js";
import { getDefinition, getEntity, listEntities, listRelations, searchModel } from "../../src/mapping.js";
import { loadPmiMinimalModel, PMI_MINIMAL_FIXTURE_ROOT } from "../fixture-model.js";

describe("mapping surface", () => {
    const model = loadPmiMinimalModel();

    it("listEntities returns id, name, description, status", () => {
        const entities = listEntities(model);
        expect(entities).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: "cliente",
                    name: "Cliente",
                    description: expect.any(String),
                    status: "confirmed",
                }),
            ]),
        );
        expect(entities[0]).not.toHaveProperty("sourceTable");
    });

    it("getEntity returns properties with semanticType, role, provenance", () => {
        const detail = getEntity(model, "cliente");
        expect(detail).not.toBeNull();
        expect(detail?.properties[0]).toEqual(
            expect.objectContaining({
                semanticType: expect.any(String),
                role: expect.any(String),
                provenance: expect.objectContaining({ table: "customers" }),
            }),
        );
    });

    it("getEntity not-found message references list_entities tool", () => {
        expect(entityNotFoundMessage("missing")).toContain(TOOL_NAMES.listEntities);
    });

    it("listRelations filters by entity id", () => {
        const all = listRelations(model);
        const filtered = listRelations(model, "fattura");
        expect(filtered.length).toBeLessThanOrEqual(all.length);
        expect(filtered.every((relation) => relation.fromEntity === "fattura" || relation.toEntity === "fattura")).toBe(
            true,
        );
    });

    it("searchModel matches cliente", async () => {
        const matches = await searchModel(model, "cliente");
        expect(matches.some((match) => match.id === "cliente")).toBe(true);
    });

    it("searchModel merges semantic hits with substring fallback", async () => {
        const matches = await searchModel(model, "cliente", {
            semanticSearch: async () => [
                {
                    kind: "entity",
                    id: "fattura",
                    name: "Fattura",
                    snippet: "Semantic hit for invoice context",
                },
            ],
        });
        expect(matches.some((match) => match.id === "cliente")).toBe(true);
        expect(matches.some((match) => match.id === "fattura")).toBe(true);
    });

    it("searchModel falls back to substring when semantic search fails", async () => {
        const matches = await searchModel(model, "cliente", {
            semanticSearch: async () => {
                throw new Error("embeddings unavailable");
            },
        });
        expect(matches.some((match) => match.id === "cliente")).toBe(true);
    });

    it("searchModel falls back to substring when semantic search returns invalid payloads", async () => {
        const matches = await searchModel(model, "cliente", {
            semanticSearch: async () => [{ kind: "entity", id: "broken" } as never],
        });
        expect(matches.some((match) => match.id === "cliente")).toBe(true);
    });

    it("getDefinition returns confirmed rule for fattura scaduta", () => {
        const result = getDefinition(model, "fattura scaduta");
        expect(result).toEqual(
            expect.objectContaining({
                found: true,
                id: "fattura-scaduta",
                status: "confirmed",
                provenance: expect.objectContaining({ table: "invoices" }),
            }),
        );
    });

    it("getDefinition ignores proposed rules", () => {
        const result = getDefinition(model, "fattura in bozza");
        expect(result.found).toBe(false);
    });
});

describe("fixture integrity", () => {
    it("loads pmi-minimal model.yaml from disk", () => {
        const raw = readFileSync(join(PMI_MINIMAL_FIXTURE_ROOT, "model.yaml"), "utf8");
        expect(raw).toContain("fattura-scaduta");
    });
});
