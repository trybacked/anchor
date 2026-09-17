import type { IngestSession } from "@backed/ingest";
import { ProfileReportSchema } from "@trybacked/core";
import type { ProfileReport } from "@trybacked/core";
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
export async function profileTables(session: IngestSession): Promise<ProfileReport> {
  const profiles = [];
  for (const dataset of session.datasets) {
    profiles.push(await profileDataset(session.query, dataset));
  }
  const withCandidates = await enrichRelationCandidates(session.query, profiles);
  return ProfileReportSchema.parse(withCandidates);
}
