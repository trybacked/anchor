import { describe, expect, it } from "vitest";
import { createDatabricksDatasetProviderFromClient } from "../../src/databricks-dataset-provider.js";
import type { DatabricksSqlClient } from "../../src/sql-client.js";

describe("createDatabricksDatasetProvider", () => {
  it("lists datasets and describes columns from SQL results", async () => {
    const calls: string[] = [];
    const client: DatabricksSqlClient = {
      async execute(sql: string) {
        calls.push(sql);
        if (sql.startsWith("SHOW TABLES")) {
          return [{ tableName: "orders" }, { tableName: "customers" }];
        }
        if (sql.startsWith("DESCRIBE TABLE")) {
          return [{ col_name: "id", data_type: "bigint", comment: "" }];
        }
        if (sql.includes("COUNT(*) AS row_count")) {
          return [{ row_count: 42 }];
        }
        if (sql.includes("null_count")) {
          return [{ null_count: 0, distinct_count: 42, min_value: "1", max_value: "42" }];
        }
        if (sql.startsWith("SELECT `id`")) {
          return [{ id: 1 }];
        }
        return [];
      },
    };

    const provider = createDatabricksDatasetProviderFromClient(
      {
        host: "example.cloud.databricks.com",
        token: "token",
        warehouseId: "wh",
        catalog: "main",
        schema: "sales",
      },
      client,
    );

    const datasets = await provider.listDatasets();
    expect(datasets.map((dataset) => dataset.id)).toEqual([
      "main.sales.orders",
      "main.sales.customers",
    ]);

    const schema = await provider.getSchema({ id: "main.sales.orders" });
    expect(schema.columns[0]?.name).toBe("id");

    const metadata = await provider.getMetadata({ id: "main.sales.orders" });
    expect(metadata.rowCount).toBe(42);

    const stats = await provider.getStatistics({ id: "main.sales.orders" });
    expect(stats.columns[0]?.distinctCount).toBe(42);

    const sample = await provider.sample?.({ id: "main.sales.orders" }, { limit: 1 });
    expect(sample?.rows).toEqual([[1]]);
    expect(calls.some((sql) => sql.includes("main"))).toBe(true);
  });
});
