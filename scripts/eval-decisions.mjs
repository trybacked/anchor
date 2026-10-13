#!/usr/bin/env node
/**
 * Summarize human vs advisor agreement from ai_proposals payloads (Postgres JSONB).
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/eval-decisions.mjs
 */
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function verdictFromHuman(decision) {
  return decision === "approve" ? "auto_approve" : "recommend_reject";
}

async function main() {
  const result = await pool.query(
    `SELECT payload FROM ai_proposals WHERE payload ? 'decisions' ORDER BY created_at DESC LIMIT 500`,
  );
  let withReview = 0;
  let agree = 0;
  let overrides = 0;
  let nullAccept = 0;
  let hypotheticalAutoApprove = 0;
  let sageUsageTokens = 0;

  for (const row of result.rows) {
    const payload = row.payload;
    if (payload?.reviewOutcome === undefined) {
      continue;
    }
    withReview += 1;
    if (payload.reviewOutcome.overridesAdvisor === true) {
      overrides += 1;
    }
    const humanVerdict = verdictFromHuman(payload.reviewOutcome.decision);
    const advisorReject = (payload.decisions ?? []).some((d) => d.verdict === "recommend_reject");
    const advisorAuto = (payload.decisions ?? []).every((d) => d.verdict === "auto_approve");
    if (humanVerdict === "auto_approve" && advisorAuto) {
      agree += 1;
    }
    if (humanVerdict === "recommend_reject" && advisorReject) {
      agree += 1;
    }
    for (const decision of payload.decisions ?? []) {
      if (decision.advisor?.accept?.answer === null) {
        nullAccept += 1;
      }
      if (decision.verdict === "auto_approve") {
        hypotheticalAutoApprove += 1;
      }
    }
    const usage = payload.decisionUsage;
    if (usage !== undefined) {
      sageUsageTokens += (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
    }
  }

  console.log(
    JSON.stringify(
      {
        proposalsSampled: result.rowCount,
        withHumanReview: withReview,
        agreementEvents: agree,
        humanOverrides: overrides,
        nullAcceptSignals: nullAccept,
        hypotheticalAutoApproveChanges: hypotheticalAutoApprove,
        sageTokensObserved: sageUsageTokens,
      },
      null,
      2,
    ),
  );
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
