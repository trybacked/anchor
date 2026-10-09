import { OntologySchema } from "@trybacked/core";
import { createHash } from "node:crypto";
import { z } from "zod";
export const PublicationProvenanceSchema = z.object({
  publishedBy: z.string().min(1),
  method: z.enum(["publish", "rollback"]),

  derivedFromVersion: z.number().int().positive().optional(),
  draftRevision: z.number().int().nonnegative().optional(),
  modelSha256: z.string().regex(/^[0-9a-f]{64}$/),
  changeSummary: z.record(z.string(), z.number().int().nonnegative()).optional(),
});
export type PublicationProvenance = z.infer<typeof PublicationProvenanceSchema>;
export const PublicationRecordSchema = z.object({
  version: z.number().int().positive(),
  publishedAt: z.string().datetime(),
  runId: z.string().min(1),
  ontology: OntologySchema,
  provenance: PublicationProvenanceSchema.optional(),
});
export type PublicationRecord = z.infer<typeof PublicationRecordSchema>;

export function modelSha256(modelYaml: string): string {
  return createHash("sha256").update(modelYaml).digest("hex");
}

export type PublicationProvenanceInput = {
  publishedBy: string;
  method: "publish" | "rollback";
  derivedFromVersion?: number | undefined;
  draftRevision?: number | undefined;

  changes?: readonly { kind: string }[] | undefined;
};

function countChangesByKind(changes: readonly { kind: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const change of changes) {
    counts[change.kind] = (counts[change.kind] ?? 0) + 1;
  }
  return counts;
}

export function buildPublicationProvenance(
  input: PublicationProvenanceInput,
  modelYaml: string,
): PublicationProvenance {
  const changeSummary = input.changes === undefined ? undefined : countChangesByKind(input.changes);
  return {
    publishedBy: input.publishedBy,
    method: input.method,
    ...(input.derivedFromVersion !== undefined
      ? { derivedFromVersion: input.derivedFromVersion }
      : {}),
    ...(input.draftRevision !== undefined ? { draftRevision: input.draftRevision } : {}),
    modelSha256: modelSha256(modelYaml),
    ...(changeSummary !== undefined && Object.keys(changeSummary).length > 0
      ? { changeSummary }
      : {}),
  };
}
