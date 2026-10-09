import type { DatasetProvider, OntologyV2 } from "@trybacked/core";
import { applyCommandsV2, AuthoringCommandV2Schema, validateOntologyV2 } from "@trybacked/core";
import { z } from "zod";
import type { OntologyLlm } from "./llm.js";
import { AiProposalSchema, ProposalEvidenceSchema, ProposedChangeSchema } from "./proposal.js";
import type { ProposalScope, ValidatedProposal } from "./proposal.js";
import { partitionProposalChanges } from "./review-policy.js";
import type { ReviewPolicy } from "./review-policy.js";

type SampledColumn = {
  datasetId: string;
  columnName: string;
  columnType: string;
  sampleValues: string[];
};

export type RunOntologyProposalOptions = {
  provider: DatasetProvider;
  llm: OntologyLlm;
  tenantId: string;
  runId: string;
  proposalId: string;
  scope: ProposalScope;

  datasetIds?: readonly string[];

  existingOntology?: OntologyV2 | undefined;
  locale?: string | undefined;
  sampleSize?: number | undefined;
  policy?: ReviewPolicy | undefined;
};

const LlmOutputSchema = z.object({
  changes: z.array(
    z.object({
      id: z.string(),
      command: AuthoringCommandV2Schema,
      confidence: z.number().min(0).max(1),
      rationale: z.string(),
      evidence: z.array(ProposalEvidenceSchema).default([]),
    }),
  ),
});

function buildProfilePrompt(input: {
  scope: ProposalScope;
  columns: SampledColumn[];
  existingObjectIds: string[];
  locale: string;
}): string {
  const scopeLine =
    input.scope.kind === "tenant"
      ? "Scope: the whole tenant (all listed datasets)."
      : input.scope.kind === "source"
        ? `Scope: the source "${input.scope.sourceId}".`
        : `Scope: the dataset "${input.scope.datasetId}".`;
  const incremental =
    input.existingObjectIds.length > 0
      ? `The ontology already contains these object types: ${input.existingObjectIds.join(", ")}. Propose only the delta (new types, links, semantics, examples).`
      : "The ontology is empty. Propose object types, properties, and links for the listed datasets.";
  return [
    "You are an ontology engineer. Given dataset schemas and value samples,",
    "propose ontology changes as a list of AuthoringCommands (format v2).",
    scopeLine,
    incremental,
    "Rules:",
    "- Prefer addObjectType with backing bindings over free-form objects.",
    "- Infer link types from value overlap; include keyMappings.",
    "- Attach semantics (synonyms, labels, glossary) in the requested locale.",
    "- Every change needs a confidence in [0,1], a rationale, and evidence",
    "  (datasetId, columnName, sampleValues).",
    `- Locale for labels and glossary: ${input.locale}.`,
    "Datasets and samples:",
    ...input.columns.map(
      (column) =>
        `- ${column.datasetId}.${column.columnName} (${column.columnType}): ${column.sampleValues.join(" | ")}`,
    ),
  ].join("\n");
}

async function sampleColumns(options: RunOntologyProposalOptions): Promise<SampledColumn[]> {
  const sampleSize = options.sampleSize ?? 5;
  const datasets =
    options.datasetIds?.map((id) => ({ id })) ?? (await options.provider.listDatasets());
  const columns: SampledColumn[] = [];
  for (const dataset of datasets) {
    const schema = await options.provider.getSchema(dataset);
    let rows: unknown[][] = [];
    if (options.provider.sample !== undefined) {
      try {
        const sampled = await options.provider.sample(dataset, { limit: sampleSize });
        rows = sampled.rows;
      } catch {
        rows = [];
      }
    }
    for (const column of schema.columns) {
      const columnIndex = schema.columns.indexOf(column);
      const sampleValues = rows
        .map((row) => row[columnIndex])
        .filter((value) => value !== null && value !== undefined)
        .map((value) =>
          typeof value === "string" || typeof value === "number" || typeof value === "boolean"
            ? String(value)
            : JSON.stringify(value),
        )
        .slice(0, sampleSize);
      columns.push({
        datasetId: dataset.id,
        columnName: column.name,
        columnType: column.type,
        sampleValues,
      });
    }
  }
  return columns;
}

export async function runOntologyProposal(
  options: RunOntologyProposalOptions,
): Promise<{ proposal: ValidatedProposal; invalidChanges: Array<{ id: string; reason: string }> }> {
  const columns = await sampleColumns(options);
  const prompt = buildProfilePrompt({
    scope: options.scope,
    columns,
    existingObjectIds: (options.existingOntology?.objectTypes ?? []).map((object) => object.id),
    locale: options.locale ?? "en",
  });
  const output = await options.llm.generateObject({ schema: LlmOutputSchema, prompt });
  const invalidChanges: Array<{ id: string; reason: string }> = [];
  const validChanges = [];
  for (const change of output.changes) {
    const parsed = ProposedChangeSchema.safeParse(change);
    if (!parsed.success) {
      invalidChanges.push({ id: change.id, reason: "schema_invalid" });
      continue;
    }
    validChanges.push(parsed.data);
  }
  const proposalDraft = AiProposalSchema.parse({
    proposalId: options.proposalId,
    tenantId: options.tenantId,
    runId: options.runId,
    scope: options.scope,
    createdAt: new Date().toISOString(),
    formatVersion: "2",
    changes: validChanges,
    status: "proposed",
  });
  const validated = {
    ...proposalDraft,
    changes: proposalDraft.changes.map((change) => ({
      ...change,
      command: AuthoringCommandV2Schema.parse(change.command),
    })),
  };

  let ontology: OntologyV2 = options.existingOntology ?? {
    metadata: { id: options.tenantId, formatVersion: "2", version: 0 },
    objectTypes: [],
    valueTypes: [],
    interfaces: [],
    linkTypes: [],
    actionTypes: [],
  };
  const applied: typeof validated.changes = [];
  for (const change of validated.changes) {
    try {
      const candidate = applyCommandsV2(ontology, [change.command]);
      const validation = validateOntologyV2(candidate);
      if (validation.valid) {
        ontology = candidate;
        applied.push(change);
      } else {
        invalidChanges.push({ id: change.id, reason: validation.issues[0]?.code ?? "invalid" });
      }
    } catch {
      invalidChanges.push({ id: change.id, reason: "apply_failed" });
    }
  }
  partitionProposalChanges(applied, options.policy);
  return {
    proposal: { ...validated, changes: applied },
    invalidChanges,
  };
}
