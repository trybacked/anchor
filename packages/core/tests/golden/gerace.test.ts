import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseModelYaml, SemanticModelSchema } from "../../src/index.js";

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), "gerace");

interface GeraceGoldenManifest {
    corpus: string;
    formatVersion: string;
    entityCount: number;
    relationCount: number;
    ruleCount: number;
    entityIds: string[];
    documentTypeEntityIds: string[];
}

function loadManifest(): GeraceGoldenManifest {
    return JSON.parse(readFileSync(join(GOLDEN_DIR, "manifest.json"), "utf8")) as GeraceGoldenManifest;
}

function loadGoldenModel() {
    return parseModelYaml(readFileSync(join(GOLDEN_DIR, "model.yaml"), "utf8"));
}

describe("Gerace golden model.yaml", () => {
    const manifest = loadManifest();

    it("parses and validates against SemanticModelSchema", () => {
        const model = loadGoldenModel();
        expect(() => SemanticModelSchema.parse(model)).not.toThrow();
    });

    it("matches golden manifest structure", () => {
        const model = loadGoldenModel();
        expect(model.metadata.formatVersion).toBe(manifest.formatVersion);
        expect(model.entities).toHaveLength(manifest.entityCount);
        expect(model.relations).toHaveLength(manifest.relationCount);
        expect(model.rules).toHaveLength(manifest.ruleCount);
        expect(model.entities.map((entity) => entity.id).sort()).toEqual([...manifest.entityIds].sort());
    });

    it("includes expected municipal document types", () => {
        const model = loadGoldenModel();
        const documentTypes = model.entities
            .filter((entity) => entity.sourceTable.startsWith("doc_"))
            .map((entity) => entity.id)
            .sort();
        expect(documentTypes).toEqual([...manifest.documentTypeEntityIds].sort());
        expect(documentTypes).toContain("determina");
        expect(documentTypes).toContain("ordinance");
    });

    it("materializes party and document graph entities", () => {
        const model = loadGoldenModel();
        const ids = new Set(model.entities.map((entity) => entity.id));
        expect(ids.has("party")).toBe(true);
        expect(ids.has("document_mention")).toBe(true);
        expect(ids.has("document_fact")).toBe(true);
    });
});
