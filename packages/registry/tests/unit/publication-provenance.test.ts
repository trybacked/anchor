import { MODEL_FORMAT_VERSION, SemanticModelSchema } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import {
  buildPublicationProvenance,
  modelSha256,
  PublicationProvenanceSchema,
} from "../../src/publication.js";
import { buildRemotePublication } from "../../src/publish.js";

const model = SemanticModelSchema.parse({
  metadata: {
    formatVersion: MODEL_FORMAT_VERSION,
    runId: "run-1",
    generatedAt: "2026-01-01T00:00:00.000Z",
  },
  entities: [],
  relations: [],
  rules: [],
});

describe("modelSha256", () => {
  it("is a stable sha-256 hex digest of the artifact", () => {
    expect(modelSha256("a: 1\n")).toMatch(/^[0-9a-f]{64}$/);
    expect(modelSha256("a: 1\n")).toBe(modelSha256("a: 1\n"));
    expect(modelSha256("a: 2\n")).not.toBe(modelSha256("a: 1\n"));
  });
});

describe("buildPublicationProvenance", () => {
  it("carries actor, method, versions and the model hash", () => {
    const provenance = buildPublicationProvenance(
      { publishedBy: "luca", method: "publish", derivedFromVersion: 3, draftRevision: 7 },
      "model-yaml",
    );
    expect(provenance.publishedBy).toBe("luca");
    expect(provenance.method).toBe("publish");
    expect(provenance.derivedFromVersion).toBe(3);
    expect(provenance.draftRevision).toBe(7);
    expect(provenance.modelSha256).toBe(modelSha256("model-yaml"));
  });

  it("summarizes diff changes as counts per kind", () => {
    const changes = [
      { kind: "added" },
      { kind: "added" },
      { kind: "changed" },
      { kind: "removed" },
    ];
    const provenance = buildPublicationProvenance(
      { publishedBy: "luca", method: "publish", changes },
      "model-yaml",
    );
    expect(provenance.changeSummary).toEqual({ added: 2, changed: 1, removed: 1 });
  });

  it("omits changeSummary and versions when not provided", () => {
    const provenance = buildPublicationProvenance(
      { publishedBy: "luca", method: "rollback" },
      "model-yaml",
    );
    expect(provenance).not.toHaveProperty("changeSummary");
    expect(provenance).not.toHaveProperty("derivedFromVersion");
    expect(provenance).not.toHaveProperty("draftRevision");
  });
});

describe("buildRemotePublication with provenance", () => {
  it("embeds the provenance (hash computed on the serialized artifact) in the record", () => {
    const { record, modelYaml } = buildRemotePublication(model, {
      ontologyId: "gerace",
      version: 4,
      provenance: {
        publishedBy: "luca",
        method: "publish",
        derivedFromVersion: 3,
        draftRevision: 2,
        changes: [{ kind: "added" }, { kind: "breaking" }],
      },
    });
    const provenance = PublicationProvenanceSchema.parse(record.provenance);
    expect(provenance.modelSha256).toBe(modelSha256(modelYaml));
    expect(provenance.changeSummary).toEqual({ added: 1, breaking: 1 });
    expect(provenance.method).toBe("publish");
    expect(provenance.derivedFromVersion).toBe(3);
  });

  it("keeps rollback provenance with the restored version as derivedFromVersion", () => {
    const { record } = buildRemotePublication(model, {
      ontologyId: "gerace",
      version: 5,
      provenance: { publishedBy: "luca", method: "rollback", derivedFromVersion: 2 },
    });
    expect(record.provenance?.method).toBe("rollback");
    expect(record.provenance?.derivedFromVersion).toBe(2);
  });

  it("produces a record without provenance when none is supplied", () => {
    const { record } = buildRemotePublication(model, { ontologyId: "gerace", version: 1 });
    expect(record.provenance).toBeUndefined();
  });
});
