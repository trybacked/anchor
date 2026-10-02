import { describe, expect, it, vi } from "vitest";
import { createDatabricksJobsClient } from "../../src/jobs-client.js";

describe("createDatabricksJobsClient", () => {
  it("findJobIdByName returns matching job id", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        jobs: [{ job_id: 99, settings: { name: "backed-docs-refresh" } }],
      }),
    );
    const client = createDatabricksJobsClient({
      host: "dbc.example.com",
      token: "t",
      warehouseId: "w",
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as typeof fetch;
    try {
      const id = await client.findJobIdByName("backed-docs-refresh");
      expect(id).toBe(99);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
