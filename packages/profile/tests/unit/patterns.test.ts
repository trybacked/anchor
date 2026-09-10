import { describe, expect, it } from "vitest";
import {
    detectPatterns,
    matchesAmount,
    matchesDate,
    matchesEmail,
    matchesFiscalCode,
    matchesVatNumber,
} from "../../src/patterns.js";

describe("matchesDate", () => {
    it("accepts ISO and common locale formats", () => {
        expect(matchesDate("2024-03-15")).toBe(true);
        expect(matchesDate("3/15/2024")).toBe(true);
        expect(matchesDate("15-3-2024")).toBe(true);
    });

    it("rejects non-date strings", () => {
        expect(matchesDate("not-a-date")).toBe(false);
        expect(matchesDate("2024/03/15")).toBe(false);
    });
});

describe("matchesEmail", () => {
    it("accepts valid emails", () => {
        expect(matchesEmail("user@example.com")).toBe(true);
    });

    it("rejects invalid emails", () => {
        expect(matchesEmail("user@")).toBe(false);
        expect(matchesEmail("@example.com")).toBe(false);
    });
});

describe("matchesVatNumber", () => {
    it("accepts 11-digit VAT numbers", () => {
        expect(matchesVatNumber("12345678901")).toBe(true);
    });

    it("rejects other formats", () => {
        expect(matchesVatNumber("1234567890")).toBe(false);
        expect(matchesVatNumber("123456789012")).toBe(false);
    });
});

describe("matchesFiscalCode", () => {
    it("accepts valid Italian fiscal codes", () => {
        expect(matchesFiscalCode("RSSMRA80A01H501U")).toBe(true);
    });

    it("rejects invalid fiscal codes", () => {
        expect(matchesFiscalCode("INVALID")).toBe(false);
    });
});

describe("matchesAmount", () => {
    it("accepts comma and dot decimal formats", () => {
        expect(matchesAmount("1.234,56")).toBe(true);
        expect(matchesAmount("1,234.56")).toBe(true);
        expect(matchesAmount("-99,00")).toBe(true);
    });

    it("rejects plain integers without decimals", () => {
        expect(matchesAmount("1234")).toBe(false);
    });
});

describe("detectPatterns", () => {
    it("returns empty array for blank input", () => {
        expect(detectPatterns([])).toEqual([]);
        expect(detectPatterns(["", "  "])).toEqual([]);
    });

    it("detects dominant pattern when threshold is met", () => {
        const values = Array.from({ length: 10 }, () => "user@example.com");
        expect(detectPatterns(values)).toEqual([{ kind: "email", matchRatio: 1 }]);
    });

    it("ignores patterns below match threshold", () => {
        const values = ["user@example.com", "not-an-email", "also-not", "nope", "still-no"];
        expect(detectPatterns(values)).toEqual([]);
    });
});
