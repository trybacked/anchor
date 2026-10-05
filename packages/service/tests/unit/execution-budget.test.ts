import { describe, expect, it } from "vitest";
import {
  applyQueryExecutionBudget,
  assertAggregateRowBudget,
  QueryExecutionBudgetError,
} from "../../src/execution-budget.js";
describe("applyQueryExecutionBudget", () => {
  it("defaults semantic_chat row limit when missing", () => {
    const query = applyQueryExecutionBudget({ objectId: "contract", filters: [] }, "semantic_chat");
    expect(query.limit).toBe(15);
  });
  it("rejects semantic_chat limits above cap", () => {
    expect(() =>
      applyQueryExecutionBudget({ objectId: "contract", filters: [], limit: 200 }, "semantic_chat"),
    ).toThrow(QueryExecutionBudgetError);
  });
  it("allows aggregate limits within semantic_chat cap", () => {
    expect(() => assertAggregateRowBudget([20, 15], "semantic_chat")).not.toThrow();
  });
  it("rejects aggregate limits above semantic_chat cap", () => {
    expect(() => assertAggregateRowBudget([40, 15], "semantic_chat")).toThrow(
      QueryExecutionBudgetError,
    );
  });
  it("skips row limit for count mode", () => {
    const query = applyQueryExecutionBudget(
      { objectId: "contract", filters: [], mode: "count", limit: 9999 },
      "semantic_chat",
    );
    expect(query.limit).toBe(9999);
    expect(query.mode).toBe("count");
  });
});
