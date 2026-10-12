import { createRunId, writeOntologyV2Yaml } from "@trybacked/core";
import { runEvaluation } from "@trybacked/evaluation";
import { runExtractStage } from "@trybacked/extraction";
import { requireAiGatewayApiKey } from "@trybacked/infrastructure";
import { runIngest } from "@trybacked/ingest";
import { runInduction } from "@trybacked/ontology-induction";
import { publishWorkspaceOntology } from "@trybacked/registry";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PipelineCheckpoint, PipelineStage } from "./stages.js";
import { PIPELINE_STAGES } from "./stages.js";

export type PipelineContext = {
  workspaceRoot: string;
  filesRoot: string;
  tenantId: string;
  env: NodeJS.ProcessEnv;
  duckDbPath?: string;
  onStage?: (stage: PipelineStage, detail: string) => void;
};

const CHECKPOINT_FILE = ".backed/pipeline-checkpoint.json";

function readCheckpoint(root: string): PipelineCheckpoint | null {
  const filePath = path.join(root, CHECKPOINT_FILE);
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, "utf8")) as PipelineCheckpoint;
}

function writeCheckpoint(root: string, checkpoint: PipelineCheckpoint): void {
  const filePath = path.join(root, CHECKPOINT_FILE);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(checkpoint, null, 2), "utf8");
}

export type RunPipelineOptions = PipelineContext & {
  fromStage?: PipelineStage;
  toStage?: PipelineStage;
};

export async function runPipeline(options: RunPipelineOptions): Promise<PipelineCheckpoint> {
  requireAiGatewayApiKey(options.env);
  const runId = createRunId();
  const checkpoint: PipelineCheckpoint = {
    runId,
    tenantId: options.tenantId,
    completedStages: [],
    updatedAt: new Date().toISOString(),
  };
  const startIndex = PIPELINE_STAGES.indexOf(options.fromStage ?? "ingest");
  const endIndex = PIPELINE_STAGES.indexOf(options.toStage ?? "sync");

  for (let i = Math.max(0, startIndex); i <= endIndex; i++) {
    const stage = PIPELINE_STAGES[i];
    if (stage === undefined) {
      continue;
    }
    options.onStage?.(stage, "start");
    switch (stage) {
      case "ingest":
        await runIngest({
          workspaceRoot: options.workspaceRoot,
          filesRoot: options.filesRoot,
          tenantId: options.tenantId,
          env: options.env,
          ...(options.duckDbPath !== undefined ? { duckDbPath: options.duckDbPath } : {}),
        });
        break;
      case "induce": {
        const induction = await runInduction({
          workspaceRoot: options.workspaceRoot,
          tenantId: options.tenantId,
          env: options.env,
        });
        writeOntologyV2Yaml(options.workspaceRoot, induction.ontology);
        writeFileSync(
          path.join(options.workspaceRoot, ".backed/change-set.json"),
          JSON.stringify(induction.changeSet, null, 2),
          "utf8",
        );
        break;
      }
      case "review":
        break;
      case "extract":
        await runExtractStage({
          workspaceRoot: options.workspaceRoot,
          tenantId: options.tenantId,
          env: options.env,
          ...(options.duckDbPath !== undefined ? { duckDbPath: options.duckDbPath } : {}),
        });
        break;
      case "materialize":
        break;
      case "evaluate":
        runEvaluation({ workspaceRoot: options.workspaceRoot, env: options.env });
        break;
      case "sync":
        publishWorkspaceOntology(options.workspaceRoot, { ontologyId: options.tenantId });
        break;
      default: {
        const _exhaustive: never = stage;
        throw new Error(`Unhandled pipeline stage: ${String(_exhaustive)}`);
      }
    }
    checkpoint.completedStages.push(stage);
    checkpoint.updatedAt = new Date().toISOString();
    writeCheckpoint(options.workspaceRoot, checkpoint);
    options.onStage?.(stage, "done");
  }
  return checkpoint;
}

export function pipelineStatus(root: string): PipelineCheckpoint | null {
  return readCheckpoint(root);
}
