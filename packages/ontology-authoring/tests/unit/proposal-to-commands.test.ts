import { describe, expect, it } from "vitest";
import { commandsFromReviewedDiscovery } from "../../src/proposal-to-commands.js";
import { MODEL_FORMAT_VERSION, type SemanticModel } from "@trybacked/core";

const emptyDraft: SemanticModel = {
  metadata: {
    formatVersion: MODEL_FORMAT_VERSION,
    runId: "draft",
    generatedAt: new Date().toISOString(),
  },
  entities: [],
  relations: [],
  rules: [],
};

describe("commandsFromReviewedDiscovery", () => {
  it("adds new entities from reviewed discovery", () => {
    const reviewed: SemanticModel = {
      metadata: {
        formatVersion: MODEL_FORMAT_VERSION,
        runId: "run-1",
        generatedAt: new Date().toISOString(),
      },
      entities: [
        {
          id: "documents",
          name: "Documents",
          sourceTable: "backed_gerace.docs.documents",
          status: "proposed",
          confidence: 0.9,
          provenance: { table: "backed_gerace.docs.documents", evidence: "test" },
          properties: [
            {
              name: "Document Id",
              columnName: "document_id",
              semanticType: "identifier",
              role: "primary_key",
              nullable: false,
              confidence: 0.95,
              provenance: {
                table: "backed_gerace.docs.documents",
                column: "document_id",
                evidence: "pk",
              },
            },
          ],
        },
      ],
      relations: [],
      rules: [],
    };
    const commands = commandsFromReviewedDiscovery(emptyDraft, reviewed);
    expect(commands).toHaveLength(1);
    expect(commands[0]?.type).toBe("addEntity");
  });

  it("adds missing properties on existing entity matched by source table", () => {
    const draft: SemanticModel = {
      ...emptyDraft,
      entities: [
        {
          id: "document",
          name: "Document",
          sourceTable: "backed_gerace.docs.documents",
          status: "confirmed",
          confidence: 1,
          provenance: { table: "backed_gerace.docs.documents", evidence: "pack" },
          properties: [
            {
              name: "Document Id",
              columnName: "document_id",
              semanticType: "identifier",
              role: "primary_key",
              nullable: false,
              confidence: 1,
              provenance: {
                table: "backed_gerace.docs.documents",
                column: "document_id",
                evidence: "pack",
              },
            },
          ],
        },
      ],
    };
    const reviewed: SemanticModel = {
      metadata: {
        formatVersion: MODEL_FORMAT_VERSION,
        runId: "run-2",
        generatedAt: new Date().toISOString(),
      },
      entities: [
        {
          id: "documents",
          name: "Documents",
          sourceTable: "backed_gerace.docs.documents",
          status: "proposed",
          confidence: 0.9,
          provenance: { table: "backed_gerace.docs.documents", evidence: "discover" },
          properties: [
            {
              name: "Document Id",
              columnName: "document_id",
              semanticType: "identifier",
              role: "primary_key",
              nullable: false,
              confidence: 0.95,
              provenance: {
                table: "backed_gerace.docs.documents",
                column: "document_id",
                evidence: "pk",
              },
            },
            {
              name: "Filename",
              columnName: "filename",
              semanticType: "text",
              role: "attribute",
              nullable: true,
              confidence: 0.8,
              provenance: {
                table: "backed_gerace.docs.documents",
                column: "filename",
                evidence: "col",
              },
            },
          ],
        },
      ],
      relations: [],
      rules: [],
    };
    const commands = commandsFromReviewedDiscovery(draft, reviewed);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: "addProperty",
      entityId: "document",
      property: { columnName: "filename" },
    });
  });

  it("emits glossary commands for reviewed terms not yet in the draft", () => {
    const reviewed: SemanticModel = {
      metadata: {
        formatVersion: MODEL_FORMAT_VERSION,
        runId: "run-3",
        generatedAt: new Date().toISOString(),
      },
      entities: [],
      relations: [],
      rules: [],
      semantics: {
        glossary: [{ id: "g-1", term: "CIG", definition: "Codice identificativo gara" }],
        examples: [],
      },
    };
    const commands = commandsFromReviewedDiscovery(emptyDraft, reviewed, {
      includeRelations: false,
    });
    expect(commands).toEqual([
      {
        type: "upsertGlossaryTerm",
        term: { id: "g-1", term: "CIG", definition: "Codice identificativo gara" },
      },
    ]);
  });
});
