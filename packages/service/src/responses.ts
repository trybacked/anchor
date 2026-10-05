import type { EntityProfileResult } from "@trybacked/runtime";
import type { RowProvenance } from "./provenance.js";
import type { QueryObjectsToolPayload } from "./response-cap.js";
import type {
  DefinitionResult,
  EntityDetail,
  EntitySummary,
  RelationSummary,
  SearchMatch,
} from "./schemas.js";
export type HealthResponse = {
  ok: true;
  capabilities: Record<string, boolean>;
};
export type ChatAskUnavailableReason = "missing_llm_gateway" | "disabled_for_tenant";
export type ChatAskStatusResponse =
  | {
      available: true;
    }
  | {
      available: false;
      reason: ChatAskUnavailableReason;
    };
export type ObjectQueryResponse = QueryObjectsToolPayload;
export type ChunkSearchResponse = {
  rows: Record<string, unknown>[];
  provenance: RowProvenance[];
};
export type EntityProfileResponse = {
  profile: EntityProfileResult;
  provenance: RowProvenance[];
};
export type GraphTraverseResponse = {
  rows: Record<string, unknown>[];
  provenance: RowProvenance[];
};
export type EntitySearchResponse = {
  matches: SearchMatch[];
};
export type ListEntitiesResponse = EntitySummary[];
export type ListRelationsResponse = RelationSummary[];
export type GetEntityResponse = EntityDetail;
export type SemanticAskStep = {
  id: string;
  type: "chunkSearch" | "objectQuery" | "agentTool";
  rowCount?: number | undefined;
  documentIds?: string[] | undefined;
  sql?: string | undefined;
  toolName?: string | undefined;
};
export type SemanticAnswerClaim = {
  text: string;
  toolCallId: string;
};
export type SemanticAgentStepRecord = {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  status: "ok" | "error";
  error?: string | undefined;
  rowCount?: number | undefined;
  sql?: string | undefined;
  durationMs: number;
};
export type SemanticAgentUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
};
export type SemanticClarificationResponse = {
  question: string;
  options: string[];
};
export type SemanticAskResult = {
  objectId: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  mode: "rows" | "count";
  sql: string;
};
export type SemanticAskResponse = {
  text: string;
  answer?: string | undefined;
  question: string;
  runId?: string | undefined;
  route: "single" | "template" | "agent";
  templateId?: string | undefined;
  plan?: Record<string, unknown> | undefined;
  result?: SemanticAskResult | undefined;
  provenance?: RowProvenance[] | undefined;
  ontologyVersion: number;
  parameterNames?: string[] | undefined;
  attempts: number;
  steps?: SemanticAskStep[] | undefined;
  claims?: SemanticAnswerClaim[] | undefined;
  assumptions?: string[] | undefined;
  followUps?: string[] | undefined;
  agentSteps?: SemanticAgentStepRecord[] | undefined;
  usage?: SemanticAgentUsage | undefined;
  clarification?: SemanticClarificationResponse | undefined;
};
export type GetDefinitionResponse = DefinitionResult;
export type GetDocumentResponse = {
  documentId: string;
  filename: string;
  docType: string;
  pageCount: number;
  folder?: string | undefined;
  status: "ready";
  contentType: string;
  sourceModifiedAt?: string | undefined;
  fileSizeBytes?: number | undefined;
};
export type DocumentPreviewResponse = {
  kind: "volumeFile";
  documentId: string;
  page: number;
  pageCount: number;
  filename: string;
  contentType: string;
};
export type DocumentPreviewFile = {
  status: 200 | 206;
  data: Uint8Array;
  contentType: string;
  filename: string;
  contentLength?: number | undefined;
  contentRange?: string | undefined;
  acceptRanges?: string | undefined;
};
export class AnchorApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, message: string, code = "anchor_api_error") {
    super(message);
    this.name = "AnchorApiError";
    this.status = status;
    this.code = code;
  }
}
export type { DocumentProvenance, EntityProvenance, RowProvenance } from "./provenance.js";
