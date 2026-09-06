/** Deterministic profiling: pure SQL → profile.json */

import { ProfileReportSchema } from "@backed/core";
import type { ProfileReport } from "@backed/core";
import type { IngestSession } from "@backed/ingest";

import { enrichRelationCandidates } from "./relation-candidates.js";
import { profileDataset } from "./table-profile.js";

export {
  detectPatterns,
  matchesAmount,
  matchesDate,
  matchesEmail,
  matchesFiscalCode,
  matchesVatNumber,
} from "./patterns.js";
export { profileDataset } from "./table-profile.js";

/** Profile all registered datasets; output is validated against the profile.json schema. */
export async function profileTables(session: IngestSession): Promise<ProfileReport> {
  const profiles = [];
  for (const dataset of session.datasets) {
    profiles.push(await profileDataset(session.query, dataset));
  }
  const withCandidates = await enrichRelationCandidates(session.query, profiles);
  return ProfileReportSchema.parse(withCandidates);
}
