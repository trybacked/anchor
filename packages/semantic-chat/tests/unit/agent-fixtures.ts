import type { Ontology } from "@trybacked/core";
import type { AnchorService } from "@trybacked/service";
export const CONTRACTS_DATASET = "shared.contracts";
export function contractOntology(): Ontology {
  return {
    metadata: { formatVersion: "1", id: "test", version: 1 },
    objects: [
      {
        id: "contract",
        name: "Contract",
        sourceDatasetId: CONTRACTS_DATASET,
        semantics: { defaultTimeDimension: "load_month" },
        properties: [
          { id: "cig", name: "Cig", type: "string", role: "primary_key" },
          {
            id: "load_month",
            name: "Load Month",
            type: "string",
            semantics: {
              semanticRole: "partition",
              valueFormat: "YYYY-MM",
              synonyms: ["ingest month"],
            },
          },
          {
            id: "published_on",
            name: "Published On",
            type: "date",
            semantics: {
              semanticRole: "time_dimension",
              synonyms: ["published", "publication date"],
            },
          },
          { id: "region", name: "Region", type: "string" },
        ],
      },
    ],
    relationships: [],
    logic: [],
    actions: [],
  };
}
export function fakeService(rowCount = 42): AnchorService {
  return {
    capabilities: () => ({}),
    objectQuery: async () => ({
      objectId: "contract",
      mode: "count",
      rowCount: 1,
      rows: [{ count: rowCount }],
      sql: "SELECT COUNT(*) FROM contract",
    }),
  } as unknown as AnchorService;
}
