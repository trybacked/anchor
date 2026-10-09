import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { syncDocumentArchiveToWarehouse } from "../../../src/adapters/duckdb/document-archive-index.js";
import { createCatalogWarehouseSqlExecutor } from "../../../src/adapters/duckdb/catalog-warehouse.js";

describe("syncDocumentArchiveToWarehouse", () => {
  it("writes document rows for files under the tenant archive", async () => {
    const root = mkdtempSync(join(tmpdir(), "backed-index-"));
    const registryRoot = mkdtempSync(join(tmpdir(), "backed-registry-"));
    mkdirSync(join(root, "leonardo", "inbox"), { recursive: true });
    writeFileSync(join(root, "leonardo", "inbox", "note.txt"), "hello");

    const outcome = await syncDocumentArchiveToWarehouse({
      env: {
        BACKED_FILES_ROOT: root,
        BACKED_FILES_REGISTRY_ROOT: registryRoot,
      },
      tenantId: "leonardo",
      catalog: "backed_leonardo",
    });
    expect(outcome.indexed).toBe(1);

    const executor = createCatalogWarehouseSqlExecutor({
      env: { BACKED_FILES_REGISTRY_ROOT: registryRoot },
      catalog: "backed_leonardo",
    });
    const rows = await executor(
      `SELECT document_id, filename, folder FROM "backed_leonardo"."docs"."documents"`,
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.filename).toBe("note.txt");
    expect(rows[0]?.folder).toBe("inbox");
  });
});
