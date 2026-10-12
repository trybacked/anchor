import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyFoundryExtractToCatalogWarehouse,
  loadFoundryWarehouseDiscoveryProfile,
} from "@trybacked/infrastructure";
import {
  DOCS_WAREHOUSE_INFRA_INCLUDE,
  discoverFromProfile,
  proposalFromDiscovery,
} from "@trybacked/discovery";
import { describe, expect, it } from "vitest";
import { buildFoundryTableRows } from "../../src/foundry/materialize-rows.js";

describe("files AI discovery baseline from Foundry warehouse", () => {
  it("proposes multiple entities and relations when infra tables are included", async () => {
    const catalog = "backed_leonardo";
    const archiveId = "a".repeat(64);
    const rows = buildFoundryTableRows(
      {
        locale: "it",
        instances: [
          {
            objectTypeId: "organization",
            name: "Leonardo S.p.A.",
            normalizedName: "leonardo_spa",
            sourceFiles: ["leonardo.pdf"],
            evidence: "test",
          },
        ],
      },
      {
        catalog,
        schema: "docs",
        note: "repro",
        documents: [{ document_id: archiveId, source_file: "leonardo.pdf", title: "Leonardo" }],
        organizations: [{ normalized_name: "leonardo_spa", name: "Leonardo S.p.A." }],
        persons: [],
        legal_instruments: [],
        topics: [],
        military_assets: [],
        linkTypes: [],
        doubts: [],
      },
    );

    const root = mkdtempSync(join(tmpdir(), "backed-ai-repro-"));
    const env = { ...process.env, BACKED_FILES_REGISTRY_ROOT: root };

    try {
      await applyFoundryExtractToCatalogWarehouse({
        env,
        catalog,
        rows,
        pageCountByDocumentId: {},
      });

      const warehouse = await loadFoundryWarehouseDiscoveryProfile({ env, catalog });
      expect(warehouse).toBeDefined();
      expect(warehouse?.profile.length ?? 0).toBeGreaterThan(2);

      const discovery = discoverFromProfile(warehouse?.profile ?? [], {
        ontologyId: "leonardo",
        includeInfraTables: DOCS_WAREHOUSE_INFRA_INCLUDE,
      });
      const proposal = proposalFromDiscovery(discovery, { runId: "repro" });

      expect(proposal.entities.length).toBeGreaterThan(2);
      expect(proposal.relations.length).toBeGreaterThan(0);
      expect(proposal.entities.some((entity) => entity.id === "document_entities")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
