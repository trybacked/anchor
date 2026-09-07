import type { SemanticModel } from "@backed/core";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getDefinition, getEntity, listEntities, listRelations, searchModel, } from "../../src/mapping.js";
import { readModelYaml } from "@backed/core";
const FIXTURE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../fixtures/pmi-minimal");
function loadFixtureModel(): SemanticModel {
    return readModelYaml(FIXTURE_ROOT);
}
describe("mapping surface", () => {
    const model = loadFixtureModel();
    it("listEntities returns id, name, description, status", () => {
        const entities = listEntities(model);
        expect(entities).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: "cliente",
                name: "Cliente",
                description: expect.any(String),
                status: "confirmed",
            }),
        ]));
        expect(entities[0]).not.toHaveProperty("sourceTable");
    });
    it("getEntity returns properties with semanticType, role, provenance", () => {
        const detail = getEntity(model, "cliente");
        expect(detail).not.toBeNull();
        expect(detail?.properties[0]).toEqual(expect.objectContaining({
            semanticType: expect.any(String),
            role: expect.any(String),
            provenance: expect.objectContaining({ table: "customers" }),
        }));
    });
    it("listRelations filters by entity id", () => {
        const all = listRelations(model);
        const filtered = listRelations(model, "fattura");
        expect(filtered.length).toBeLessThanOrEqual(all.length);
        expect(filtered.every((relation) => relation.fromEntity === "fattura" || relation.toEntity === "fattura")).toBe(true);
    });
    it("searchModel matches cliente", () => {
        const matches = searchModel(model, "cliente");
        expect(matches.some((match) => match.id === "cliente")).toBe(true);
    });
    it("getDefinition returns confirmed rule for fattura scaduta", () => {
        const result = getDefinition(model, "fattura scaduta");
        expect(result).toEqual(expect.objectContaining({
            found: true,
            id: "fattura-scaduta",
            status: "confirmed",
            provenance: expect.objectContaining({ table: "invoices" }),
        }));
    });
    it("getDefinition ignores proposed rules", () => {
        const result = getDefinition(model, "fattura in bozza");
        expect(result.found).toBe(false);
    });
});
describe("fixture integrity", () => {
    it("loads pmi-minimal model.yaml from disk", () => {
        const raw = readFileSync(join(FIXTURE_ROOT, "model.yaml"), "utf8");
        expect(raw).toContain("fattura-scaduta");
    });
});
