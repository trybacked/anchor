import type { EntityProfileResult } from "@trybacked/runtime";
import type { RowProvenance } from "./provenance.js";
import type { QueryObjectsToolPayload } from "./response-cap.js";
import type { EntityDetail, EntitySummary, RelationSummary, SearchMatch } from "./schemas.js";

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

export type {
  DocumentProvenance,
  EntityProvenance,
  RowProvenance,
} from "./provenance.js";
