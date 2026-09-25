import { describe, expect, it } from "vitest";
import { capQueryObjectsPayload, MCP_TOOL_RESULT_MAX_BYTES } from "../../src/response-cap.js";

describe("capQueryObjectsPayload", () => {
  it("returns payload unchanged when under the byte limit", () => {
    const payload = {
      objectId: "customer",
      columns: ["id"],
      rows: [{ id: 1 }],
      rowCount: 1,
    };
    expect(capQueryObjectsPayload(payload)).toEqual(payload);
  });

  it("trims rows when the serialized payload is too large", () => {
    const big = "x".repeat(80_000);
    const rows = Array.from({ length: 20 }, (_, index) => ({ id: index, blob: big }));
    const payload = {
      objectId: "contract",
      columns: ["id", "blob"],
      rows,
      rowCount: rows.length,
    };
    const capped = capQueryObjectsPayload(payload);
    expect(capped.truncated).toBe(true);
    expect(capped.originalRowCount).toBe(20);
    expect(capped.rows.length).toBeLessThan(20);
    expect(JSON.stringify(capped).length).toBeLessThanOrEqual(MCP_TOOL_RESULT_MAX_BYTES);
  });
});
