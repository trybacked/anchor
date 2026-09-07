import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEntityProfileReader } from "../../src/entity-profile-reader.js";
import { materializeEntityProfiles } from "../../src/materialize-entity-profiles.js";
import type { MaterializeEntityProfilesOptions } from "../../src/materialize-entity-profiles.js";
import { createDuckDbSession } from "../../src/session.js";
import type { DuckDbSession } from "../../src/session.js";
const PROCUREMENT_FACT_TYPES: MaterializeEntityProfilesOptions["factTypes"] = [
    { id: "importo_contrattuale", aggregation: "sum" },
    { id: "oneri_sicurezza", aggregation: "sum" },
    { id: "ribasso_pct", aggregation: "max" },
];
const INVOICE_FACT_TYPES: MaterializeEntityProfilesOptions["factTypes"] = [
    { id: "invoice_total", aggregation: "sum" },
    { id: "shipping_fee", aggregation: "sum" },
    { id: "discount_rate", aggregation: "max" },
];
async function createCorpusTables(session: DuckDbSession): Promise<void> {
    await session.query(`CREATE TABLE document_entities (
    entity_id VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    normalized_name VARCHAR NOT NULL,
    mention_count INTEGER NOT NULL,
    document_count INTEGER NOT NULL,
    sector VARCHAR,
    role VARCHAR,
    summary VARCHAR,
    enrichment_confidence DOUBLE
  )`);
    await session.query(`CREATE TABLE document_mentions (
    mention_id VARCHAR NOT NULL,
    document_id VARCHAR NOT NULL,
    entity_id VARCHAR,
    mention_type VARCHAR NOT NULL,
    text VARCHAR NOT NULL,
    normalized_value VARCHAR NOT NULL,
    page INTEGER NOT NULL,
    line INTEGER NOT NULL,
    confidence DOUBLE NOT NULL,
    context VARCHAR NOT NULL
  )`);
    await session.query(`CREATE TABLE document_facts (
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
}
async function seedProcurementCorpus(session: DuckDbSession): Promise<void> {
    await createCorpusTables(session);
    await session.query(`INSERT INTO document_entities VALUES
    ('edil_vincent', 'EDIL VINCENT SRL', 'edil vincent srl', 5, 2, 'edilizia', 'aggiudicataria', 'Impresa edile', 0.9),
    ('promocost', 'PROMOCOST SRL', 'promocost srl', 3, 2, 'servizi_tecnici', 'mandante_rti', 'Servizi tecnici', 0.8),
    ('solitaria', 'SOLITARIA SPA', 'solitaria spa', 1, 1, NULL, NULL, NULL, NULL)`);
    await session.query(`INSERT INTO document_mentions VALUES
    ('m1', 'doc_a', 'edil_vincent', 'entity', 'EDIL VINCENT SRL', 'EDIL VINCENT SRL', 1, 4, 0.9, 'ctx'),
    ('m2', 'doc_b', 'edil_vincent', 'entity', 'EDIL VINCENT SRL', 'EDIL VINCENT SRL', 1, 7, 0.9, 'ctx'),
    ('m3', 'doc_a', 'promocost', 'entity', 'PROMOCOST SRL', 'PROMOCOST SRL', 1, 5, 0.9, 'ctx'),
    ('m4', 'doc_c', 'promocost', 'entity', 'PROMOCOST SRL', 'PROMOCOST SRL', 2, 1, 0.9, 'ctx'),
    ('m5', 'doc_d', 'solitaria', 'entity', 'SOLITARIA SPA', 'SOLITARIA SPA', 1, 2, 0.9, 'ctx'),
    ('c1', 'doc_a', NULL, 'cig', 'CIG Z111111111', 'Z111111111', 1, 2, 0.95, 'ctx'),
    ('c2', 'doc_b', NULL, 'cig', 'CIG Z222222222', 'Z222222222', 1, 2, 0.95, 'ctx'),
    ('c3', 'doc_c', NULL, 'cig', 'CIG Z333333333', 'Z333333333', 1, 2, 0.95, 'ctx')`);
    await session.query(`INSERT INTO document_facts VALUES
    ('f1', 'doc_a', 'edil_vincent', 'cig', 'Z111111111', 'importo_contrattuale', 100000, '€ 100.000,00', 1, 4),
    ('f2', 'doc_b', 'edil_vincent', 'cig', 'Z222222222', 'importo_contrattuale', 250000, '€ 250.000,00', 1, 7),
    ('f3', 'doc_b', 'edil_vincent', 'cig', 'Z222222222', 'oneri_sicurezza', 5000, '€ 5.000,00', 1, 8),
    ('f4', 'doc_b', 'edil_vincent', NULL, NULL, 'ribasso_pct', 12.5, 'ribasso del 12,5%', 1, 9),
    ('f5', 'doc_c', 'promocost', 'cig', 'Z333333333', 'importo_contrattuale', 40000, '€ 40.000,00', 2, 1)`);
}
async function seedInvoiceCorpus(session: DuckDbSession): Promise<void> {
    await createCorpusTables(session);
    await session.query(`INSERT INTO document_entities VALUES
    ('acme_building_inc', 'ACME Building Inc', 'ACME BUILDING INC', 4, 2, 'construction', 'supplier', 'Contractor', 0.9),
    ('northwind_freight_llc', 'Northwind Freight LLC', 'NORTHWIND FREIGHT LLC', 2, 1, 'logistics', 'supplier', 'Carrier', 0.8)`);
    await session.query(`INSERT INTO document_mentions VALUES
    ('m1', 'inv_1', 'acme_building_inc', 'entity', 'ACME Building Inc', 'ACME BUILDING INC', 1, 1, 0.9, 'ctx'),
    ('m2', 'inv_2', 'acme_building_inc', 'entity', 'ACME Building Inc', 'ACME BUILDING INC', 1, 1, 0.9, 'ctx'),
    ('m3', 'inv_1', 'northwind_freight_llc', 'entity', 'Northwind Freight LLC', 'NORTHWIND FREIGHT LLC', 1, 3, 0.9, 'ctx'),
    ('p1', 'inv_1', NULL, 'po', 'PO 4451', '4451', 1, 2, 0.95, 'ctx'),
    ('p2', 'inv_2', NULL, 'po', 'PO 4452', '4452', 1, 2, 0.95, 'ctx')`);
    await session.query(`INSERT INTO document_facts VALUES
    ('f1', 'inv_1', 'acme_building_inc', 'po', '4451', 'invoice_total', 1250, '$1,250.00', 1, 4),
    ('f2', 'inv_2', 'acme_building_inc', 'po', '4452', 'invoice_total', 800, '$800.00', 1, 4),
    ('f3', 'inv_1', 'northwind_freight_llc', 'po', '4451', 'shipping_fee', 75, '$75.00', 1, 5),
    ('f4', 'inv_1', 'acme_building_inc', NULL, NULL, 'discount_rate', 12.5, '12.5%', 1, 6)`);
}
async function profileColumns(session: DuckDbSession): Promise<string[]> {
    const rows = await session.query(`SELECT column_name FROM information_schema.columns
     WHERE table_name = 'entity_profiles' ORDER BY column_name`);
    return rows.map((row) => String(row["column_name"]));
}
describe("materializeEntityProfiles", () => {
    let session: DuckDbSession;
    beforeEach(async () => {
        session = await createDuckDbSession();
        await seedProcurementCorpus(session);
    });
    afterEach(() => {
        session.close();
    });
    it("rolls up amounts, identifiers, documents, and related entities", async () => {
        const result = await materializeEntityProfiles(session.query, {
            factTypes: PROCUREMENT_FACT_TYPES,
        });
        expect(result.profileCount).toBe(3);
        const rows = await session.query("SELECT * FROM entity_profiles WHERE entity_id = 'edil_vincent'");
        const profile = rows[0];
        expect(Number(profile?.["total_importo_contrattuale"])).toBe(350000);
        expect(Number(profile?.["total_oneri_sicurezza"])).toBe(5000);
        expect(Number(profile?.["max_ribasso_pct"])).toBe(12.5);
        expect(Number(profile?.["cig_count"])).toBe(2);
        expect(profile?.["cig_list"]).toBe("Z111111111, Z222222222");
        expect(profile?.["document_ids"]).toBe("doc_a, doc_b");
        expect(Number(profile?.["related_count"])).toBe(1);
        expect(profile?.["related_names"]).toBe("PROMOCOST SRL");
    });
    it("names the aggregate columns after the fact types present in the data", async () => {
        await materializeEntityProfiles(session.query, { factTypes: PROCUREMENT_FACT_TYPES });
        const columns = await profileColumns(session);
        expect(columns).toContain("total_importo_contrattuale");
        expect(columns).toContain("total_oneri_sicurezza");
        expect(columns).toContain("max_ribasso_pct");
        expect(columns).toContain("cig_count");
        expect(columns).toContain("cig_list");
        expect(columns).not.toContain("total_invoice_total");
        expect(columns).not.toContain("po_count");
    });
    it("aggregates the topics of the entity's documents", async () => {
        await session.query(`CREATE TABLE doc_determina (
      document_id VARCHAR NOT NULL,
      topics VARCHAR,
      page_count INTEGER NOT NULL
    )`);
        await session.query(`INSERT INTO doc_determina VALUES
      ('doc_a', 'pnrr, appalto', 3),
      ('doc_b', 'appalto', 4),
      ('doc_c', 'tributi', 2)`);
        await materializeEntityProfiles(session.query, { factTypes: PROCUREMENT_FACT_TYPES });
        const rows = await session.query("SELECT entity_id, topics FROM entity_profiles");
        const byId = new Map(rows.map((row) => [row["entity_id"], row["topics"]]));
        expect(byId.get("edil_vincent")).toBe("appalto, pnrr");
        expect(byId.get("promocost")).toBe("appalto, pnrr, tributi");
        expect(byId.get("solitaria")).toBeNull();
    });
    it("scopes identifiers to the documents the entity appears in", async () => {
        await materializeEntityProfiles(session.query, { factTypes: PROCUREMENT_FACT_TYPES });
        const rows = await session.query("SELECT cig_count, cig_list FROM entity_profiles WHERE entity_id = 'promocost'");
        expect(Number(rows[0]?.["cig_count"])).toBe(2);
        expect(rows[0]?.["cig_list"]).toBe("Z111111111, Z333333333");
    });
    it("keeps entities without facts or related rows, with zeroed counters", async () => {
        await materializeEntityProfiles(session.query, { factTypes: PROCUREMENT_FACT_TYPES });
        const rows = await session.query("SELECT * FROM entity_profiles WHERE entity_id = 'solitaria'");
        const profile = rows[0];
        expect(Number(profile?.["fact_count"])).toBe(0);
        expect(Number(profile?.["cig_count"])).toBe(0);
        expect(Number(profile?.["related_count"])).toBe(0);
        expect(profile?.["total_importo_contrattuale"]).toBeNull();
        expect(profile?.["document_ids"]).toBe("doc_d");
    });
    it("is idempotent across runs", async () => {
        await materializeEntityProfiles(session.query, { factTypes: PROCUREMENT_FACT_TYPES });
        const second = await materializeEntityProfiles(session.query, {
            factTypes: PROCUREMENT_FACT_TYPES,
        });
        expect(second.profileCount).toBe(3);
    });
    it("registers a dataset only when the corpus produced entities", async () => {
        await session.query("DELETE FROM document_entities");
        const result = await materializeEntityProfiles(session.query, {
            factTypes: PROCUREMENT_FACT_TYPES,
        });
        expect(result.profileCount).toBe(0);
        expect(result.datasetsAdded).toHaveLength(0);
    });
});
describe("materializeEntityProfiles on an unrelated corpus", () => {
    let session: DuckDbSession;
    beforeEach(async () => {
        session = await createDuckDbSession();
        await seedInvoiceCorpus(session);
    });
    afterEach(() => {
        session.close();
    });
    it("generates the rollup columns of that corpus's fact and identifier types", async () => {
        await materializeEntityProfiles(session.query, { factTypes: INVOICE_FACT_TYPES });
        const columns = await profileColumns(session);
        expect(columns).toContain("total_invoice_total");
        expect(columns).toContain("total_shipping_fee");
        expect(columns).toContain("max_discount_rate");
        expect(columns).toContain("po_count");
        expect(columns).toContain("po_list");
        expect(columns).not.toContain("total_importo_contrattuale");
        expect(columns).not.toContain("cig_count");
    });
    it("aggregates each quantity the way its fact type declares", async () => {
        await materializeEntityProfiles(session.query, { factTypes: INVOICE_FACT_TYPES });
        const rows = await session.query("SELECT * FROM entity_profiles WHERE entity_id = 'acme_building_inc'");
        const profile = rows[0];
        expect(Number(profile?.["total_invoice_total"])).toBe(2050);
        expect(Number(profile?.["max_discount_rate"])).toBe(12.5);
        expect(Number(profile?.["po_count"])).toBe(2);
        expect(profile?.["po_list"]).toBe("4451, 4452");
        expect(profile?.["related_names"]).toBe("Northwind Freight LLC");
    });
});
describe("createEntityProfileReader", () => {
    let session: DuckDbSession;
    beforeEach(async () => {
        session = await createDuckDbSession();
        await seedProcurementCorpus(session);
        await session.query(`CREATE TABLE doc_determina (
      document_id VARCHAR NOT NULL,
      source_file VARCHAR,
      protocol_number VARCHAR,
      published_date VARCHAR,
      subject VARCHAR,
      issuing_office VARCHAR,
      topics VARCHAR,
      summary VARCHAR,
      page_count INTEGER NOT NULL
    )`);
        await session.query(`INSERT INTO doc_determina VALUES
      ('doc_a', 'a.pdf', '123', '2026-01-10', 'Affidamento lavori', 'Ufficio tecnico', 'appalto, pnrr', 'Affida i lavori', 3),
      ('doc_b', 'b.pdf', '124', '2026-02-11', 'Contratto RTI', 'Ufficio tecnico', 'appalto', 'Stipula il contratto', 4)`);
        await materializeEntityProfiles(session.query, { factTypes: PROCUREMENT_FACT_TYPES });
    });
    afterEach(() => {
        session.close();
    });
    it("returns the rollup with its documents and facts in one call", async () => {
        const reader = createEntityProfileReader(session.query);
        const results = await reader({ name: "edil vincent" });
        expect(results).toHaveLength(1);
        const [entry] = results;
        expect(entry?.profile["name"]).toBe("EDIL VINCENT SRL");
        expect(entry?.facts).toHaveLength(4);
        expect(entry?.documents).toHaveLength(2);
        expect(entry?.documents[0]?.["subject"]).toBeTypeOf("string");
    });
    it("matches on a name fragment regardless of case", async () => {
        const reader = createEntityProfileReader(session.query);
        const results = await reader({ name: "PROMO" });
        expect(results[0]?.profile["entity_id"]).toBe("promocost");
    });
    it("returns no results for an unknown entity", async () => {
        const reader = createEntityProfileReader(session.query);
        expect(await reader({ name: "inesistente" })).toHaveLength(0);
    });
    it("returns attributed identifiers persisted at ingest on coded mentions", async () => {
        await session.query(`INSERT INTO document_mentions VALUES
      ('p1', 'doc_a', 'edil_vincent', 'piva', 'P.IVA 11111111111', '11111111111', 1, 3, 0.95, 'Affidamento a EDIL VINCENT SRL P.IVA 11111111111'),
      ('p2', 'doc_a', NULL, 'piva', 'P.IVA 22222222222', '22222222222', 1, 8, 0.95, 'Servizi Morpheme S.r.l. P.IVA 22222222222'),
      ('c_attr', 'doc_a', 'edil_vincent', 'cig', 'CIG Z111111111', 'Z111111111', 1, 2, 0.95, 'Affidamento a EDIL VINCENT SRL CIG Z111111111')`);
        await materializeEntityProfiles(session.query, { factTypes: PROCUREMENT_FACT_TYPES });
        const reader = createEntityProfileReader(session.query);
        const results = await reader({ name: "edil vincent" });
        expect(results[0]?.attributedIdentifiers).toEqual({
            piva: ["11111111111"],
            cig: ["Z111111111"],
        });
        expect(results[0]?.profile["piva_list"]).toContain("22222222222");
        expect(results[0]?.profile["attributed_piva_list"]).toBe("11111111111");
        expect(results[0]?.profile["attributed_cig_list"]).toBe("Z111111111");
    });
    it("orders facts by amount and honours the fact limit", async () => {
        const reader = createEntityProfileReader(session.query);
        const results = await reader({ name: "edil vincent", factLimit: 2 });
        const facts = results[0]?.facts ?? [];
        expect(facts).toHaveLength(2);
        expect(Number(facts[0]?.["amount"])).toBe(250000);
    });
});
