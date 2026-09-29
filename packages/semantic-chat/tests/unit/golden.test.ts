import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Ontology } from "@trybacked/core";
import type { OntologyQueryRuntime } from "@trybacked/runtime";
import { describe, expect, it } from "vitest";
import { createSemanticChatEngine } from "../../src/engine.js";
import type { SemanticQueryPlan } from "../../src/plan-types.js";

const ontology: Ontology = {
  metadata: { formatVersion: "1", id: "demo", version: 1 },
  objects: [
    {
      id: "contract",
      name: "Contract",
      sourceDatasetId: "backed.anac.contracts",
      properties: [{ id: "cig", name: "CIG", type: "string", role: "primary_key" }],
    },
  ],
  relationships: [],
  logic: [],
  actions: [],
};

const goldenDir = join(dirname(fileURLToPath(import.meta.url)), "../golden");

describe("semantic-chat golden plans", () => {
  it("executes count-contracts.json without LLM", async () => {
    const fixture = JSON.parse(
      readFileSync(join(goldenDir, "count-contracts.json"), "utf8"),
    ) as {
      plan: SemanticQueryPlan;
      expectObjectId: string;
      expectMode: "count" | "rows";
    };
    const runtime: OntologyQueryRuntime = {
      queryObjects: async () => ({
        objectId: "contract",
        columns: ["count"],
        rows: [{ count: 42 }],
        rowCount: 1,
        sql: "SELECT COUNT(*) ...",
      }),
    };
    const engine = createSemanticChatEngine({
      ontology,
      queryRuntime: runtime,
      translate: async () => {
        throw new Error("LLM must not run");
      },
    });
    const answer = await engine.executePlan(fixture.plan);
    expect(answer.result.objectId).toBe(fixture.expectObjectId);
    expect(answer.result.mode).toBe(fixture.expectMode);
  });
});
