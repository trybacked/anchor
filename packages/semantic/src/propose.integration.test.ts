/**
 * Integration test with the real AI Gateway. Runs only when AI_GATEWAY_API_KEY
 * is set (pnpm --filter @backed/semantic test:integration) — never in CI unit runs.
 */

import { ProposalSchema } from "@backed/core";
import { describe, expect, it } from "vitest";

import { resolveSemanticModels } from "./env.js";
import { proposeModel } from "./propose.js";
import { buildPmiProfile } from "./test-helpers.js";

const hasApiKey = Boolean(process.env["AI_GATEWAY_API_KEY"]);

describe.runIf(hasApiKey)("proposeModel (real gateway)", () => {
  it("proposes a schema-valid ontology for the pmi profile", async () => {
    const proposal = await proposeModel({
      profile: buildPmiProfile(),
      runId: "integration-test",
      models: resolveSemanticModels(),
    });

    expect(() => ProposalSchema.parse(proposal)).not.toThrow();
    expect(proposal.entities.length).toBeGreaterThanOrEqual(2);
    expect(proposal.questions.length).toBeGreaterThan(0);
  }, 120_000);
});

describe.runIf(!hasApiKey)("proposeModel (real gateway, skipped)", () => {
  it("is skipped without AI_GATEWAY_API_KEY", () => {
    expect(hasApiKey).toBe(false);
  });
});
