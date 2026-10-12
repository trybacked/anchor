export const PIPELINE_STAGES = [
  "ingest",
  "induce",
  "review",
  "extract",
  "materialize",
  "evaluate",
  "sync",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type PipelineCheckpoint = {
  runId: string;
  tenantId: string;
  completedStages: PipelineStage[];
  updatedAt: string;
};
