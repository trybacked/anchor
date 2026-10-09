import type { AuthoringCommandV2 } from "@trybacked/core";
import { AuthoringCommandV2Schema } from "@trybacked/core";
import { z } from "zod";

export const ProposalEvidenceSchema = z.object({
  datasetId: z.string().min(1).optional(),
  columnName: z.string().min(1).optional(),
  sampleValues: z.array(z.string()).max(5).default([]),
});
export type ProposalEvidence = z.infer<typeof ProposalEvidenceSchema>;

export const ProposedChangeSchema = z.object({
  id: z.string().min(1),
  command: z.unknown(), // AuthoringCommandV2, validated via AuthoringCommandV2Schema.parse
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  evidence: z.array(ProposalEvidenceSchema).default([]),
});
export type ProposedChange = z.infer<typeof ProposedChangeSchema>;

export const ProposalScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("source"), sourceId: z.string().min(1) }),
  z.object({ kind: z.literal("dataset"), datasetId: z.string().min(1) }),
  z.object({ kind: z.literal("tenant") }),
]);
export type ProposalScope = z.infer<typeof ProposalScopeSchema>;

export const AiProposalSchema = z.object({
  proposalId: z.string().min(1),
  tenantId: z.string().min(1),
  runId: z.string().min(1),
  scope: ProposalScopeSchema,
  createdAt: z.string().datetime(),

  formatVersion: z.literal("2"),
  changes: z.array(ProposedChangeSchema),
  status: z.enum(["proposed", "approved", "rejected", "applied"]).default("proposed"),
});
export type AiProposal = z.infer<typeof AiProposalSchema>;

export type ValidatedProposal = AiProposal & {
  changes: Array<ProposedChange & { command: AuthoringCommandV2 }>;
};

export function parseProposal(input: unknown): ValidatedProposal {
  const proposal = AiProposalSchema.parse(input);
  const changes = proposal.changes.map((change) => ({
    ...change,
    command: AuthoringCommandV2Schema.parse(change.command),
  }));
  return { ...proposal, changes };
}
