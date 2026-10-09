import { describe, expect, it } from "vitest";
import type { ColumnProfile, DatasetSample, TableProfile } from "@trybacked/core";
import {
  inferCardinality,
  inferForeignKeyCandidates,
  inferProfileForeignKeys,
} from "../../src/index.js";

function column(
  name: string,
  sqlType: string,
  overrides: Partial<ColumnProfile> = {},
): ColumnProfile {
  return {
    name,
    sqlType,
    nullCount: 0,
    nullRatio: 0,
    distinctCount: 3,
    min: null,
    max: null,
    topValues: [],
    patterns: [],
    foreignKeyCandidates: [],
    ...overrides,
  };
}

function table(
  name: string,
  columns: ColumnProfile[],
  rowCount = 3,
  sourceFile = name,
): TableProfile {
  return { table: name, sourceFile, rowCount, columns };
}

function sample(columns: string[], rows: unknown[][]): DatasetSample {
  return { columns, rows };
}

const ORDERS = table("orders", [
  column("order_id", "INTEGER", { distinctCount: 3 }),
  column("customer_id", "INTEGER", { distinctCount: 2, nullCount: 1, nullRatio: 1 / 4 }),
]);

const CUSTOMERS = table("customers", [column("customer_id", "INTEGER", { distinctCount: 3 })]);

const ORDERS_SAMPLE = sample(
  ["order_id", "customer_id"],
  [
    [1, 10],
    [2, 20],
    [3, 30],
    [4, null],
  ],
);

const CUSTOMERS_SAMPLE = sample(["customer_id"], [[10], [20], [30]]);

describe("inferForeignKeyCandidates", () => {
  it("finds a join backed by overlapping sampled values", () => {
    const candidates = inferForeignKeyCandidates(
      { table: ORDERS, column: ORDERS.columns[1]!, sample: ORDERS_SAMPLE },
      [{ profile: CUSTOMERS, sample: CUSTOMERS_SAMPLE }],
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      targetTable: "customers",
      targetColumn: "customer_id",
      overlapRatio: 1,
      confidence: 1,
    });
  });

  it("drops candidates below the overlap threshold", () => {
    const weakSample = sample(
      ["order_id", "customer_id"],
      [
        [1, 10],
        [2, 21],
        [3, 22],
      ],
    );
    const candidates = inferForeignKeyCandidates(
      { table: ORDERS, column: ORDERS.columns[1]!, sample: weakSample },
      [{ profile: CUSTOMERS, sample: CUSTOMERS_SAMPLE }],
    );
    expect(candidates).toEqual([]);
  });

  it("rejects type-incompatible destinations", () => {
    const mismatched = table("customers", [column("customer_id", "VARCHAR", { distinctCount: 3 })]);
    const candidates = inferForeignKeyCandidates(
      { table: ORDERS, column: ORDERS.columns[1]!, sample: ORDERS_SAMPLE },
      [{ profile: mismatched, sample: CUSTOMERS_SAMPLE }],
    );
    expect(candidates).toEqual([]);
  });

  it("only considers unique, never-null parent columns", () => {
    const repeated = table("customers", [column("customer_id", "INTEGER", { distinctCount: 2 })]);
    const candidates = inferForeignKeyCandidates(
      { table: ORDERS, column: ORDERS.columns[1]!, sample: ORDERS_SAMPLE },
      [{ profile: repeated, sample: CUSTOMERS_SAMPLE }],
    );
    expect(candidates).toEqual([]);
  });
});

describe("inferCardinality", () => {
  it("infers one_to_one for a unique never-null child column", () => {
    const unique = column("customer_id", "INTEGER", { distinctCount: 4 });
    expect(inferCardinality(unique, 4)).toBe("one_to_one");
  });
  it("infers many_to_one when child values repeat", () => {
    const repeated = column("customer_id", "INTEGER", { distinctCount: 2, nullCount: 1 });
    expect(inferCardinality(repeated, 4)).toBe("many_to_one");
  });
});

describe("inferProfileForeignKeys", () => {
  it("fills foreignKeyCandidates across the report", () => {
    const [profiledOrders] = inferProfileForeignKeys(
      [ORDERS, CUSTOMERS],
      new Map([
        ["orders", ORDERS_SAMPLE],
        ["customers", CUSTOMERS_SAMPLE],
      ]),
    );
    const fkColumn = profiledOrders?.columns.find((entry) => entry.name === "customer_id");
    expect(fkColumn?.foreignKeyCandidates[0]).toMatchObject({
      targetTable: "customers",
      targetColumn: "customer_id",
    });
  });

  it("leaves tables without samples untouched", () => {
    const [profiledOrders] = inferProfileForeignKeys(
      [ORDERS, CUSTOMERS],
      new Map([["customers", CUSTOMERS_SAMPLE]]),
    );
    expect(profiledOrders?.columns.every((entry) => entry.foreignKeyCandidates.length === 0)).toBe(
      true,
    );
  });
});
