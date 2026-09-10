import { describe, expect, it } from "vitest";
import { nameAlignmentBonus } from "../../src/relation-candidates.js";

describe("nameAlignmentBonus", () => {
    it("returns strong alignment when column stem matches table name", () => {
        expect(nameAlignmentBonus("customer_id", "customers", "id")).toBe(1);
        expect(nameAlignmentBonus("codice_fornitore", "fornitore", "id")).toBe(1);
    });

    it("returns id-match alignment for generic id columns", () => {
        expect(nameAlignmentBonus("order_id", "products", "id")).toBe(0.95);
    });

    it("returns base alignment for weak name matches", () => {
        expect(nameAlignmentBonus("status_code", "invoices", "code")).toBe(0.85);
    });
});
