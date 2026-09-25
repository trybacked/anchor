/** Stay under typical MCP client limits (~1MB), with headroom for JSON framing. */
export const MCP_TOOL_RESULT_MAX_BYTES = 900_000;

export const MCP_DEFAULT_OBJECT_QUERY_LIMIT = 15;

export type QueryObjectsToolPayload = {
  objectId: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  mode?: "rows" | "count";
  truncated?: boolean;
  originalRowCount?: number;
  truncationReason?: string;
};

export function capQueryObjectsPayload(payload: QueryObjectsToolPayload): QueryObjectsToolPayload {
  if (JSON.stringify(payload).length <= MCP_TOOL_RESULT_MAX_BYTES) {
    return payload;
  }

  const originalRowCount = payload.rowCount;
  let low = 0;
  let high = payload.rows.length;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate: QueryObjectsToolPayload = {
      ...payload,
      rows: payload.rows.slice(0, mid),
      rowCount: mid,
    };
    if (JSON.stringify(candidate).length <= MCP_TOOL_RESULT_MAX_BYTES) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  const kept = payload.rows.slice(0, low);
  return {
    ...payload,
    rows: kept,
    rowCount: kept.length,
    truncated: true,
    originalRowCount,
    truncationReason:
      "Response exceeded MCP size limit (~1MB). Rows were trimmed. Use mode \"count\" for totals, " +
      "add filters, pass a lower limit, or request fewer fields.",
  };
}
