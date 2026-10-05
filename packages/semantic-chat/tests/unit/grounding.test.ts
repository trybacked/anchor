import { describe, expect, it } from "vitest";
import {
  groundAnswer,
  resolveToolCallId,
  validateAnswerGrounding,
} from "../../src/agent/grounding.js";
import { resultContainsNumeric } from "../../src/agent/numeric-grounding.js";
const steps = [
  { toolCallId: "call-0", toolName: "search_schema", status: "ok" as const },
  { toolCallId: "call-1", toolName: "query_objects", status: "ok" as const },
  { toolCallId: "call-2", toolName: "query_objects", status: "error" as const, error: "fail" },
  { toolCallId: "call-3", toolName: "query_objects", status: "ok" as const },
];
const toolResults = new Map<string, unknown>([
  ["call-0", { hits: [] }],
  ["call-1", { rowCount: 1, rows: [{ count: 10 }] }],
  ["call-3", { rowCount: 1, rows: [{ count: 42 }] }],
]);
describe("resolveToolCallId", () => {
  it("keeps a real toolCallId", () => {
    expect(resolveToolCallId("call-3", steps, toolResults)).toBe("call-3");
  });
  it("maps bare tool names to the last successful call", () => {
    expect(resolveToolCallId("query_objects", steps, toolResults)).toBe("call-3");
    expect(resolveToolCallId("functions.query_objects", steps, toolResults)).toBe("call-3");
  });
  it("maps ordinals to the nth successful call (1-based)", () => {
    expect(resolveToolCallId("query_objects-1", steps, toolResults)).toBe("call-1");
    expect(resolveToolCallId("query_objects-2", steps, toolResults)).toBe("call-3");
  });
  it("maps tool_N and numeric aliases", () => {
    expect(resolveToolCallId("tool_1", steps, toolResults)).toBe("call-1");
    expect(resolveToolCallId("1", steps, toolResults)).toBe("call-1");
  });
});
describe("resultContainsNumeric", () => {
  it("matches Italian thousands against plain warehouse values", () => {
    const result = { rowCount: 1, rows: [{ count: "121416" }] };
    expect(resultContainsNumeric(result, "121.416")).toBe(true);
    expect(resultContainsNumeric(result, "27.842")).toBe(false);
    expect(resultContainsNumeric({ rows: [{ count: "27842" }] }, "27.842")).toBe(true);
  });
});
describe("validateAnswerGrounding", () => {
  it("accepts claims that cite tool names instead of ids", () => {
    expect(() =>
      validateAnswerGrounding({
        answer: "There are 42 contracts.",
        claims: [{ text: "42 contracts", toolCallId: "functions.query_objects" }],
        steps,
        toolResults,
      }),
    ).not.toThrow();
  });
  it("accepts row identifiers present in query results even without a dedicated claim", () => {
    expect(() =>
      validateAnswerGrounding({
        answer: "Il CIG 72289297 è tra i primi per importo.",
        claims: [{ text: "top per importo", toolCallId: "call-3" }],
        steps: [{ toolCallId: "call-3", toolName: "query_objects", status: "ok" }],
        toolResults: new Map([
          [
            "call-3",
            {
              rows: [{ cig: "72289297", importo_lotto: 1000 }],
              rowCount: 1,
            },
          ],
        ]),
      }),
    ).not.toThrow();
  });
  it("rebinds to the last supporting query when the same count appears in multiple results", () => {
    const grounded = groundAnswer({
      answer: "There are 10 contracts.",
      claims: [{ text: "10 contracts", toolCallId: "call-wrong" }],
      steps: [
        { toolCallId: "call-a", toolName: "query_objects", status: "ok" },
        { toolCallId: "call-b", toolName: "query_objects", status: "ok" },
      ],
      toolResults: new Map([
        ["call-a", { rowCount: 1, rows: [{ count: 10 }] }],
        ["call-b", { rowCount: 1, rows: [{ count: 10 }] }],
      ]),
    });
    expect(grounded.claims[0]?.toolCallId).toBe("call-b");
  });
  it("ignores year literals inside claim prose", () => {
    expect(() =>
      validateAnswerGrounding({
        answer: "121416 contracts in ingest month 2025-06.",
        claims: [
          {
            text: "121416 contracts for ingest month 2025-06",
            toolCallId: "call-3",
          },
        ],
        steps,
        toolResults: new Map([["call-3", { rowCount: 1, rows: [{ count: "121416" }] }]]),
      }),
    ).not.toThrow();
  });
});
