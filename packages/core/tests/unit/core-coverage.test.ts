import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MODEL_FORMAT_VERSION } from "../../src/constants.js";
import {
  collectDocumentFieldKeys,
  documentField,
  enrichmentFieldValues,
  fieldsFromRecord,
  getDocumentFieldValue,
  hasEnrichmentFieldValues,
  isDocumentInfrastructureColumn,
  longestDocumentFieldValue,
  mergeDocumentFields,
  normalizeDocumentFieldKey,
} from "../../src/document-fields.js";
import type { DocumentCatalogEntry } from "../../src/document-catalog.js";
import type { SemanticModel } from "../../src/model.js";
import {
  parseModelYaml,
  readModelYaml,
  serializeModelYaml,
  writeModelYaml,
} from "../../src/model-yaml.js";
import { ProfileReportSchema } from "../../src/profile.js";
import {
  hasRunArtifact,
  listRunIds,
  readRunArtifact,
  writeRunArtifact,
} from "../../src/run-artifacts.js";
import {
  patchWorkspaceConfig,
  readWorkspaceConfig,
  writeWorkspaceConfig,
} from "../../src/workspace-config.js";
import { createRunId, workspacePaths } from "../../src/workspace.js";
import {
  describeTerms,
  EMPTY_DOMAIN_VOCABULARY,
  mergeVocabulary,
  termIds,
} from "../../src/domain.js";
import { isIndexedOntologyTable } from "../../src/entity-search.js";

const MINIMAL_MODEL: SemanticModel = {
  metadata: {
    formatVersion: MODEL_FORMAT_VERSION,
    runId: "run-test",
    generatedAt: "2026-01-01T00:00:00.000Z",
  },
  entities: [],
  relations: [],
  rules: [],
};

describe("workspace helpers", () => {
  it("creates deterministic run ids with injected clock", () => {
    const runId = createRunId(new Date("2026-01-01T00:00:00.000Z"));
    expect(runId.startsWith("20260101T000000-")).toBe(true);
  });

  it("resolves workspace paths", () => {
    const paths = workspacePaths("/tmp/demo");
    expect(paths.modelPath).toContain("model.yaml");
    expect(paths.artifactPath("run-1", "profile")).toContain("profile.json");
  });
});

describe("model yaml IO", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "core-model-yaml-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("round-trips model yaml", () => {
    const yaml = serializeModelYaml(MINIMAL_MODEL);
    expect(parseModelYaml(yaml).metadata.runId).toBe("run-test");
  });

  it("writes and reads model.yaml from disk", () => {
    const path = writeModelYaml(root, MINIMAL_MODEL);
    expect(readModelYaml(root)).toEqual(MINIMAL_MODEL);
    expect(path).toContain("model.yaml");
  });

  it("throws when model.yaml is missing", async () => {
    const emptyRoot = await mkdtemp(join(tmpdir(), "core-model-missing-"));
    expect(() => readModelYaml(emptyRoot)).toThrow(/Missing model/);
    await rm(emptyRoot, { recursive: true, force: true });
  });
});

describe("workspace config IO", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "core-workspace-config-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("writes, reads, and patches workspace config", () => {
    writeWorkspaceConfig(root, {
      sourcesDir: "./sources",
      documentTypeHints: [],
      domain: undefined,
    });
    expect(readWorkspaceConfig(root).sourcesDir).toBe("./sources");
    patchWorkspaceConfig(root, { sourcesDir: "./data" });
    expect(readWorkspaceConfig(root).sourcesDir).toBe("./data");
  });

  it("throws when config is missing", async () => {
    const emptyRoot = await mkdtemp(join(tmpdir(), "core-config-missing-"));
    expect(() => readWorkspaceConfig(emptyRoot)).toThrow(/Workspace not initialized/);
    await rm(emptyRoot, { recursive: true, force: true });
  });
});

describe("run artifacts", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "core-run-artifacts-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("writes, reads, and lists run artifacts", () => {
    const profile: [] = [];
    writeRunArtifact(root, "run-1", "profile", profile);
    expect(hasRunArtifact(root, "run-1", "profile")).toBe(true);
    expect(readRunArtifact(root, "run-1", "profile", ProfileReportSchema)).toEqual(profile);
    expect(listRunIds(root)).toEqual(["run-1"]);
  });

  it("throws when artifact is missing", () => {
    expect(() => readRunArtifact(root, "missing", "profile", ProfileReportSchema)).toThrow(
      /Missing artifact/,
    );
    expect(listRunIds("/missing-root")).toEqual([]);
  });
});

describe("document fields", () => {
  const document: DocumentCatalogEntry = {
    sourceTable: "doc_demo_pdf",
    sourceFile: "demo.pdf",
    pageCount: 1,
    documentType: "invoice",
    documentTypeLabel: "Invoice",
    confidence: 0.9,
    fields: {
      summary: documentField("hello", 0.8),
      topics: documentField("finance", 0.7),
    },
  };

  it("normalizes keys and reads field values", () => {
    expect(normalizeDocumentFieldKey(" Invoice Number ")).toBe("invoice_number");
    expect(getDocumentFieldValue(document, "Summary")).toBe("hello");
  });

  it("builds fields from records and merges updates", () => {
    const fields = fieldsFromRecord({ "Line Total": "10" }, 0.5);
    expect(fields.line_total?.value).toBe("10");
    expect(mergeDocumentFields(document.fields, fields)).toMatchObject(fields);
  });

  it("collects keys and enrichment helpers", () => {
    expect(collectDocumentFieldKeys([document])).toEqual(["summary", "topics"]);
    expect(enrichmentFieldValues(document).summary).toBe("hello");
    expect(hasEnrichmentFieldValues(enrichmentFieldValues(document))).toBe(true);
    expect(
      longestDocumentFieldValue({
        ...document,
        fields: {
          summary: documentField("a".repeat(25), 0.8),
        },
      }),
    ).toHaveLength(25);
    expect(isDocumentInfrastructureColumn("document_id")).toBe(true);
  });
});

describe("domain and entity search helpers", () => {
  it("merges vocabulary overrides and lists term ids", () => {
    const merged = mergeVocabulary(EMPTY_DOMAIN_VOCABULARY, {
      entityLabel: "organization",
      documentTopics: [{ id: "finance", label: "Finance", description: "Finance docs" }],
    });
    expect(merged.entityLabel).toBe("organization");
    expect(termIds(merged.documentTopics)).toEqual(["finance"]);
    expect(describeTerms(merged.documentTopics)).toContain("Finance");
  });

  it("detects indexed ontology tables", () => {
    expect(isIndexedOntologyTable("entity_profiles")).toBe(true);
    expect(isIndexedOntologyTable("customers")).toBe(false);
  });
});
