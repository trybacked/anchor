import { describe, expect, it } from "vitest";
import { enrichProposalFromDiscovery } from "../../src/enrich-proposal.js";

describe("enrichProposalFromDiscovery", () => {
  it("adds schema-derived relations missing from the LLM proposal", () => {
    const proposal = {
      runId: "run-1",
      generatedAt: new Date().toISOString(),
      entities: [
        {
          id: "orders",
          name: "Orders",
          sourceTable: "orders",
          status: "proposed" as const,
          confidence: 0.9,
          provenance: { table: "orders", evidence: "test" },
          properties: [
            {
              name: "Customer",
              columnName: "customer_id",
              semanticType: "identifier" as const,
              role: "foreign_key" as const,
              nullable: false,
              confidence: 0.9,
              provenance: { table: "orders", column: "customer_id", evidence: "fk" },
            },
          ],
        },
        {
          id: "customers",
          name: "Customers",
          sourceTable: "customers",
          status: "proposed" as const,
          confidence: 0.9,
          provenance: { table: "customers", evidence: "test" },
          properties: [
            {
              name: "Id",
              columnName: "id",
              semanticType: "identifier" as const,
              role: "primary_key" as const,
              nullable: false,
              confidence: 0.9,
              provenance: { table: "customers", column: "id", evidence: "pk" },
            },
          ],
        },
      ],
      relations: [],
      rules: [],
      doubts: [],
      questions: [],
    };

    const discovery = {
      inspection: { inspectedAt: new Date().toISOString(), tables: [] },
      ontology: {
        metadata: { formatVersion: "1" as const, id: "demo", version: 1 },
        objects: [],
        relationships: [
          {
            id: "orders__customer_id__customers",
            name: "Customer Id To Customers",
            fromObjectId: "orders",
            toObjectId: "customers",
            fromPropertyId: "customer_id",
            toPropertyId: "id",
            cardinality: "many_to_one" as const,
            status: "proposed" as const,
          },
        ],
        logic: [],
        actions: [],
      },
    };

    const result = enrichProposalFromDiscovery(proposal, discovery);
    expect(result.addedRelationIds).toHaveLength(1);
    expect(result.proposal.relations[0]?.fromEntity).toBe("orders");
    expect(result.proposal.relations[0]?.toEntity).toBe("customers");
  });
});
