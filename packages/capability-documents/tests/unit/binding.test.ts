import { describe, expect, it } from "vitest";
import {
  LEGACY_DOCUMENT_ARCHIVE_BINDING,
  documentTablesFromBinding,
  discoveryTablesFromBinding,
} from "../../src/binding.js";

describe("legacy document archive binding", () => {
  it("parses against the core binding schema", () => {
    expect(LEGACY_DOCUMENT_ARCHIVE_BINDING.datasets.documents).toBe("documents");
    expect(LEGACY_DOCUMENT_ARCHIVE_BINDING.columns.documentId).toBe("document_id");
  });

  it("projects runtime and discovery table specs", () => {
    const tables = documentTablesFromBinding(LEGACY_DOCUMENT_ARCHIVE_BINDING);
    expect(tables.entityProfiles).toBe("entity_profiles");
    const discovery = discoveryTablesFromBinding(LEGACY_DOCUMENT_ARCHIVE_BINDING);
    expect(discovery).toContain("document_pages");
  });

  it("supports custom tenant bindings", () => {
    const tables = documentTablesFromBinding({
      ...LEGACY_DOCUMENT_ARCHIVE_BINDING,
      datasets: { ...LEGACY_DOCUMENT_ARCHIVE_BINDING.datasets, documents: "contracts_main" },
    });
    expect(tables.documents).toBe("contracts_main");
  });
});
