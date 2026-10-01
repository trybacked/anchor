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
  type: "chunkSearch" | "objectQuery";
  rowCount?: number | undefined;
  documentIds?: string[] | undefined;
  sql?: string | undefined;
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
  question: string;
  route: "single" | "template";
  templateId?: string | undefined;
  plan: Record<string, unknown>;
  result: SemanticAskResult;
  provenance: RowProvenance[];
  ontologyVersion: number;
  parameterNames: string[];
  attempts: number;
  steps: SemanticAskStep[];
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
