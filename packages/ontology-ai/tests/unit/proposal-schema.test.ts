import { describe, expect, it } from "vitest";
import { AiProposalSchema } from "../../src/proposal.js";

describe("AiProposalSchema", () => {
  it("accepts legacy payloads without decisions", () => {
    const parsed = AiProposalSchema.parse({
      proposalId: "p1",
      tenantId: "t1",
      runId: "r1",
      scope: { kind: "tenant" },
      createdAt: new Date().toISOString(),
      formatVersion: "2",
      changes: [],
      status: "proposed",
    });
    expect(parsed.decisions).toEqual([]);
  });
});
