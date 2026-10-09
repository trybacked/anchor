import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTenantArchiveFromEnv, documentIdFromVolumePath } from "../../../src/adapters/files/tenant-archive.js";

describe("tenant archive (local)", () => {
  it("lists folders and files with volume paths", async () => {
    const root = mkdtempSync(join(tmpdir(), "backed-archive-"));
    mkdirSync(join(root, "leonardo", "contratti"), { recursive: true });
    writeFileSync(join(root, "leonardo", "contratti", "a.pdf"), "pdf");
    const archive = createTenantArchiveFromEnv({
      env: { BACKED_FILES_ROOT: root },
      tenantId: "leonardo",
      catalog: "backed_leonardo",
    });
    const top = await archive.list();
    expect(top.entries.some((entry) => entry.name === "contratti" && entry.isDirectory)).toBe(true);
    const nested = await archive.list({ folder: "contratti" });
    expect(nested.entries).toHaveLength(1);
    expect(nested.entries[0]?.path).toBe("/Volumes/backed_leonardo/docs/raw/contratti/a.pdf");
    expect(nested.entries[0]?.documentId).toBe(
      documentIdFromVolumePath("/Volumes/backed_leonardo/docs/raw/contratti/a.pdf"),
    );
  });

  it("uploads into a folder", async () => {
    const root = mkdtempSync(join(tmpdir(), "backed-archive-"));
    const archive = createTenantArchiveFromEnv({
      env: { BACKED_FILES_ROOT: root },
      tenantId: "leonardo",
      catalog: "backed_leonardo",
    });
    const uploaded = await archive.upload({
      filename: "note.txt",
      data: new TextEncoder().encode("hello"),
      folder: "inbox",
    });
    expect(uploaded.name).toBe("note.txt");
    expect(uploaded.path).toBe("/Volumes/backed_leonardo/docs/raw/inbox/note.txt");
    const listing = await archive.list({ folder: "inbox" });
    expect(listing.entries).toHaveLength(1);
  });
});
