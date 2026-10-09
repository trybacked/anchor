import { describe, expect, it } from "vitest";
import {
  buildFoundryTableRows,
  synthesizeFoundryExtractFromSeed,
} from "../../src/foundry/materialize-rows.js";
import type { FoundrySeedPayload } from "../../src/foundry/seed.js";

const seed: FoundrySeedPayload = {
  catalog: "backed_military",
  schema: "docs",
  note: "test",
  documents: [{ document_id: "wiki_nato", source_file: "wiki-nato.pdf", title: "NATO" }],
  organizations: [{ normalized_name: "nato", name: "NATO" }],
  persons: [],
  legal_instruments: [],
  topics: [],
  military_assets: [],
  linkTypes: [],
  doubts: [],
};

describe("buildFoundryTableRows", () => {
  it("creates profile and mention rows from extract + seed", () => {
    const output = synthesizeFoundryExtractFromSeed(seed);
    const rows = buildFoundryTableRows(output, seed);
    expect(rows.documents).toHaveLength(1);
    expect(rows.organization_profiles).toHaveLength(1);
    expect(rows.document_organization_mentions?.length ?? 0).toBeGreaterThan(0);
  });
});
