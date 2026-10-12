import {
  ONTOLOGY_FORMAT_VERSION_V2,
  type OntologyChangeSet,
  type OntologyV2,
  applyCommandsV2,
  type AuthoringCommandV2,
} from "@trybacked/core";
import { loadCompetencyQuestions } from "./competency.js";
import { runLlms4OlInduction } from "./llms4ol-pipeline.js";
import { loadSampledCorpus } from "./load-corpus.js";

export type RunInductionOptions = {
  workspaceRoot: string;
  tenantId: string;
  env: NodeJS.ProcessEnv;
  competencyQuestions?: string[];
};

export type RunInductionResult = {
  ontology: OntologyV2;
  changeSet: OntologyChangeSet;
};

function seedOntology(tenantId: string): OntologyV2 {
  return {
    metadata: {
      formatVersion: ONTOLOGY_FORMAT_VERSION_V2,
      id: tenantId,
      version: 1,
      generatedAt: new Date().toISOString(),
    },
    valueTypes: [],
    interfaces: [],
    objectTypes: [
      {
        id: "document",
        name: "Document",
        description: "An ingested source file with parsed content",
        backing: [{ sourceId: "primary", datasetId: "docs.documents", columnMappings: {} }],
        properties: [
          {
            kind: "physical",
            id: "uri",
            name: "URI",
            type: "string",
            bindingSourceId: "primary",
            column: "uri",
            role: "primary_key",
            nullable: false,
            confidence: 0.9,
            provenance: { evidence: "induction_seed" },
            status: "proposed",
            source: "inferred",
          },
          {
            kind: "physical",
            id: "title",
            name: "Title",
            type: "string",
            bindingSourceId: "primary",
            column: "title",
            role: "attribute",
            nullable: true,
            confidence: 0.85,
            provenance: { evidence: "induction_seed" },
            status: "proposed",
            source: "inferred",
          },
        ],
        confidence: 0.85,
        provenance: { evidence: "induction_seed" },
        status: "proposed",
        source: "inferred",
      },
    ],
    linkTypes: [],
    actionTypes: [],
  };
}

function dedupeAuthoringCommands(commands: AuthoringCommandV2[]): AuthoringCommandV2[] {
  const objectTypeIds = new Set<string>();
  const linkTypeIds = new Set<string>();
  const semanticsApplied = new Set<string>();
  const deduped: AuthoringCommandV2[] = [];
  for (const command of commands) {
    if (command.type === "addObjectType") {
      if (objectTypeIds.has(command.objectType.id)) {
        continue;
      }
      objectTypeIds.add(command.objectType.id);
    }
    if (command.type === "addLinkType") {
      if (linkTypeIds.has(command.linkType.id)) {
        continue;
      }
      linkTypeIds.add(command.linkType.id);
    }
    if (command.type === "setObjectTypeSemantics") {
      if (semanticsApplied.has(command.objectTypeId)) {
        continue;
      }
      semanticsApplied.add(command.objectTypeId);
    }
    deduped.push(command);
  }
  return deduped;
}

export async function runInduction(options: RunInductionOptions): Promise<RunInductionResult> {
  const competencyQuestions =
    options.competencyQuestions ?? loadCompetencyQuestions(options.workspaceRoot);
  const samples = loadSampledCorpus(options.workspaceRoot);
  const base = seedOntology(options.tenantId);

  const seedObjectTypeIds = new Set(base.objectTypes.map((objectType) => objectType.id));
  const llmCommands = dedupeAuthoringCommands(
    await runLlms4OlInduction({
      env: options.env,
      workspaceRoot: options.workspaceRoot,
      samples,
      competencyQuestions,
    }),
  ).filter((command) => {
    if (command.type === "addObjectType" && seedObjectTypeIds.has(command.objectType.id)) {
      return false;
    }
    return true;
  });

  if (llmCommands.length === 0) {
    throw new Error("LLM induction returned no ontology commands.");
  }

  const ontology = applyCommandsV2(base, llmCommands);
  const changeSet: OntologyChangeSet = {
    changeSetId: `cs_${String(Date.now())}`,
    tenantId: options.tenantId,
    runId: `run_${String(Date.now())}`,
    createdAt: new Date().toISOString(),
    formatVersion: "2",
    status: "proposed",
    changes: llmCommands.map((command, index) => ({
      id: `change_${String(index)}`,
      command,
      confidence: command.type === "addObjectType" ? (command.objectType.confidence ?? 0.7) : 0.7,
      rationale: "LLMs4OL staged induction (terms → relations → SKOS labels).",
      evidence: samples.slice(0, 2).map((sample) => ({
        excerpt: sample.excerpt.slice(0, 200),
        sourceUri: sample.uri,
        sampleValues: [],
      })),
    })),
  };

  return { ontology, changeSet };
}
