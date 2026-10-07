import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createFileIndexDatasetProvider } from "../../../src/adapters/files/file-index-provider.js";

describe("createFileIndexDatasetProvider", () => {
  it("lists each top-level folder as a dataset", async () => {
    const root = mkdtempSync(join(tmpdir(), "backed-files-"));
    mkdirSync(join(root, "contratti"));
    writeFileSync(join(root, "contratti", "a.pdf"), "pdf");
    writeFileSync(join(root, "readme.txt"), "hello");
    const provider = createFileIndexDatasetProvider({ root });
    const datasets = await provider.listDatasets();
    expect(datasets.map((dataset) => dataset.id).sort()).toEqual(["_root", "contratti"]);
    const meta = await provider.getMetadata({ id: "contratti" });
    expect(meta.rowCount).toBe(1);
  });
});
