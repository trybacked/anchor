import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDecisionModelFromEnv } from "@trybacked/infrastructure";
import { describe, expect, it } from "vitest";

const LIVE_TEST_TIMEOUT_MS = 60_000;
import { DEFAULT_DECISION_POLICY } from "../../src/decision/decision-policy.js";
import { runOntologyProposal } from "../../src/pipeline.js";
import { fakeDatasetProvider, fakeOntologyLlm } from "./fixtures.js";

const e2eDir = dirname(fileURLToPath(import.meta.url));
const anchorRoot = resolve(e2eDir, "../../../..");

function loadDotEnv(path: string): void {
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}

loadDotEnv(join(anchorRoot, ".env"));

if (process.env["SAGE_TIMEOUT_MS"]?.trim() === undefined) {
  process.env["SAGE_TIMEOUT_MS"] = "45000";
}
if (process.env["SAGE_REASONING"]?.trim() === undefined) {
  process.env["SAGE_REASONING"] = "off";
}

const liveEnabled = Boolean(process.env["SAGE_API_KEY"]?.trim());

describe.skipIf(!liveEnabled)("Sage live API (e2e)", () => {
  it(
    "calls /decide/batch with the configured API key",
    { timeout: LIVE_TEST_TIMEOUT_MS },
    async () => {
      const decisionModel = createDecisionModelFromEnv(process.env);
      expect(decisionModel).toBeDefined();

      const batch = await decisionModel!.decideBatch([
        {
          content:
            "Proposed ontology change: add Contract object type backed by contract_id column.",
          questions: [
            {
              kind: "yesno",
              id: "accept",
              question:
                "Should this ontology change be accepted as consistent with the described evidence?",
            },
          ],
        },
      ]);

      expect(batch.groups[0]?.ok).toBe(true);
      if (batch.groups[0]?.ok) {
        const accept = batch.groups[0].answers.find(
          (answer) => answer.kind === "yesno" && answer.id === "accept",
        );
        expect(accept?.kind).toBe("yesno");
        if (accept?.kind === "yesno") {
          expect(accept.probability).toBeGreaterThanOrEqual(0);
          expect(accept.probability).toBeLessThanOrEqual(1);
        }
      }
      expect(batch.modelId.length).toBeGreaterThan(0);
    },
  );

  it(
    "runs the full proposal pipeline when Sage answers the change batch",
    { timeout: LIVE_TEST_TIMEOUT_MS },
    async (context) => {
      const decisionModel = createDecisionModelFromEnv(process.env);
      const { proposal } = await runOntologyProposal({
        provider: fakeDatasetProvider(),
        llm: fakeOntologyLlm() as never,
        tenantId: "tenant-live-e2e",
        runId: "run-live-e2e",
        proposalId: "prop-live-e2e",
        scope: { kind: "tenant" },
        decisionPolicy: DEFAULT_DECISION_POLICY,
        decisionModel,
      });

      expect(proposal.decisions).toHaveLength(1);
      const decision = proposal.decisions[0];
      if (decision?.reasons.includes("decision_unavailable")) {
        context.skip(
          "Sage batch timed out or was unavailable (common with yesno+tags on long content). Smoke test above validates the API key.",
        );
      }
      expect(decision?.advisor).toBeDefined();
    },
  );
});
