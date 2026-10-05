import { describe, expect, it } from "vitest";
import { applySemanticCatalogs, type Ontology, type SemanticCatalog } from "../../src/index.js";
function ontology(overrides: Partial<Ontology> = {}): Ontology {
  return {
    metadata: { formatVersion: "1", id: "t", version: 1 },
    objects: [
      {
        id: "contract",
        name: "Contract",
        sourceDatasetId: "shared.contracts",
        properties: [
          { id: "month", name: "Month", type: "string" },
          { id: "amount", name: "Amount", type: "decimal", semantics: { description: "own" } },
        ],
      },
      { id: "note", name: "Note", properties: [{ id: "body", name: "Body", type: "string" }] },
    ],
    relationships: [],
    logic: [],
    actions: [],
    ...overrides,
  };
}
const catalog: SemanticCatalog = {
  id: "shared",
  datasets: {
    "shared.contracts": {
      entity: { defaultTimeDimension: "month", synonyms: ["deal"] },
      properties: {
        month: { semanticRole: "partition", valueFormat: "YYYY-MM" },
        amount: { semanticRole: "measure", description: "catalog" },
      },
    },
  },
  glossary: [
    {
      id: "ingest",
      term: "ingest month",
      definition: "Load month",
      datasetId: "shared.contracts",
      propertyId: "month",
    },
    { id: "absent", term: "absent", definition: "Other dataset", datasetId: "other.table" },
  ],
  examples: [
    {
      id: "ex-count",
      question: "How many contracts?",
      expectedObjectQuery: { objectId: "contract", mode: "count" },
    },
  ],
};
describe("applySemanticCatalogs", () => {
  it("fills semantics on objects matching the source dataset", () => {
    const result = applySemanticCatalogs(ontology(), [catalog]);
    const contract = result.objects[0]!;
    expect(contract.semantics?.defaultTimeDimension).toBe("month");
    expect(contract.properties[0]!.semantics).toEqual({
      semanticRole: "partition",
      valueFormat: "YYYY-MM",
    });
    expect(result.objects[1]!.semantics).toBeUndefined();
  });
  it("keeps tenant-authored values over catalog defaults", () => {
    const amount = applySemanticCatalogs(ontology(), [catalog]).objects[0]!.properties[1]!;
    expect(amount.semantics).toEqual({ semanticRole: "measure", description: "own" });
  });
  it("resolves glossary terms to tenant object ids and drops unrelated datasets", () => {
    const glossary = applySemanticCatalogs(ontology(), [catalog]).semantics?.glossary ?? [];
    expect(glossary).toEqual([
      {
        id: "ingest",
        term: "ingest month",
        definition: "Load month",
        objectId: "contract",
        propertyId: "month",
      },
    ]);
  });
  it("does not override tenant glossary terms with the same id", () => {
    const own = ontology({
      semantics: { glossary: [{ id: "ingest", term: "mine", definition: "tenant" }], examples: [] },
    });
    const glossary = applySemanticCatalogs(own, [catalog]).semantics?.glossary ?? [];
    expect(glossary).toEqual([{ id: "ingest", term: "mine", definition: "tenant" }]);
  });
  it("merges catalog verified examples without overriding tenant examples", () => {
    const own = ontology({
      semantics: {
        glossary: [],
        examples: [{ id: "ex-count", question: "tenant question" }],
      },
    });
    const examples = applySemanticCatalogs(own, [catalog]).semantics?.examples ?? [];
    expect(examples).toEqual([{ id: "ex-count", question: "tenant question" }]);
  });
  it("adds catalog examples when the tenant has none", () => {
    const examples = applySemanticCatalogs(ontology(), [catalog]).semantics?.examples ?? [];
    expect(examples).toHaveLength(1);
    expect(examples[0]?.id).toBe("ex-count");
  });
  it("drops entity hints that reference properties the tenant object lacks", () => {
    const partial: SemanticCatalog = {
      ...catalog,
      datasets: {
        "shared.contracts": {
          entity: {
            displayProperties: ["month", "importo_lotto", "amount"],
            defaultTimeDimension: "data_pubblicazione",
          },
          properties: {},
        },
      },
    };
    const contract = applySemanticCatalogs(ontology(), [partial]).objects[0]!;
    expect(contract.semantics).toEqual({ displayProperties: ["month", "amount"] });
  });
  it("is idempotent", () => {
    const once = applySemanticCatalogs(ontology(), [catalog]);
    expect(applySemanticCatalogs(once, [catalog])).toEqual(once);
  });
});
