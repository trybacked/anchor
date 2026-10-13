import type { DatasetProvider } from "@trybacked/core";
import { expect } from "vitest";

export function fakeDatasetProvider(): DatasetProvider {
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

export function fakeOntologyLlm() {
  return {
    generateObject: async <T>({ schema, prompt }: { schema: unknown; prompt: string }) => {
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
      expect(typeof prompt).toBe("string");
      return (schema as { parse: (value: unknown) => T }).parse(object);
    },
  };
}
