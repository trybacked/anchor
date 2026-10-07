import type { DatasetProvider } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import { runOntologyProposal } from "../../src/pipeline.js";
import { classifyChange, partitionProposalChanges } from "../../src/review-policy.js";
import { DEFAULT_REVIEW_POLICY } from "../../src/review-policy.js";

function fakeProvider(): DatasetProvider {
  return {
    listDatasets: async () => [{ id: "db.main.contracts", name: "contracts" }],
    getSchema: async () => ({
      columns: [
        { name: "contract_id", type: "string", nullable: false },
        { name: "supplier_name", type: "string", nullable: true },
      ],
    }),
    getMetadata: async () => ({ rowCount: 10 }),
    getStatistics: async () => ({ columns: [] }),
    sample: async (_dataset, options) => {
      const limit = options?.limit ?? 2;
      return {
        columns: ["contract_id", "supplier_name"],
        rows: Array.from({ length: Math.min(limit, 2) }, (_, i) => [`C-${String(i)}`, "Acme"]),
      };
    },
  };
}

function fakeLlm() {
  return {
    generateObject: async <T>({ schema, prompt }: { schema: unknown; prompt: string }) => {
      const parsedPrompt = prompt;
      const object = {
        changes: [
          {
            id: "change-1",
            command: {
              type: "addObjectType",
              objectType: {
                id: "contract",
                name: "Contract",
                backing: [
                  {
                    sourceId: "contracts",
                    datasetId: "db.main.contracts",
                    columnMappings: { contract_id: "contract_id" },
                  },
                ],
                properties: [
                  {
                    kind: "physical",
                    id: "contract_id",
                    name: "Contract ID",
                    type: "string",
                    bindingSourceId: "contracts",
                    column: "contract_id",
                    role: "primary_key",
                  },
                ],
              },
            },
            confidence: 0.93,
            rationale: "contract_id is a stable identifier column.",
            evidence: [
              { datasetId: "db.main.contracts", columnName: "contract_id", sampleValues: ["C-0"] },
            ],
          },
        ],
      };
      // Validate through the caller-provided schema to mimic generateObject.
      const result = (schema as { parse: (value: unknown) => T }).parse(object);
      expect(typeof parsedPrompt).toBe("string");
      return result;
    },
  };
}

describe("runOntologyProposal", () => {
  it("produces a validated ChangeSet from a fake LLM", async () => {
    const { proposal, invalidChanges } = await runOntologyProposal({
      provider: fakeProvider(),
      llm: fakeLlm() as never,
      tenantId: "tenant-a",
      runId: "run-1",
      proposalId: "prop-1",
      scope: { kind: "tenant" },
    });
    expect(invalidChanges).toEqual([]);
    expect(proposal.changes).toHaveLength(1);
    expect(proposal.changes[0]?.command.type).toBe("addObjectType");
    expect(proposal.status).toBe("proposed");
  });

  it("classifies breaking changes as human review regardless of confidence", () => {
    const remove = { command: { type: "removeObjectType", objectId: "x" } as never, confidence: 1 };
    expect(classifyChange(remove, DEFAULT_REVIEW_POLICY)).toBe("human_review");
  });

  it("partitions by policy threshold", () => {
    const changes = [
      { command: { type: "addObjectType", objectType: {} } as never, confidence: 0.99 },
      { command: { type: "addObjectType", objectType: {} } as never, confidence: 0.5 },
    ];
    const { autoApproved, requiresReview } = partitionProposalChanges(
      changes,
      DEFAULT_REVIEW_POLICY,
    );
    expect(autoApproved).toHaveLength(1);
    expect(requiresReview).toHaveLength(1);
  });
});
