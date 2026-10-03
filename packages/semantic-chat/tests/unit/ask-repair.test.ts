import type { Ontology } from "@trybacked/core";
import type { OntologyQueryRuntime } from "@trybacked/runtime";
import { describe, expect, it } from "vitest";
import { createSemanticChatEngine } from "../../src/engine.js";

const ontology: Ontology = {
  metadata: { formatVersion: "1", id: "demo", version: 1 },
  objects: [
    {
      id: "contract",
      name: "Contract",
      sourceDatasetId: "backed.anac.contracts",
      properties: [{ id: "oggetto_gara", name: "Subject", type: "string", role: "attribute" }],
    },
  ],
  relationships: [],
  logic: [],
  actions: [],
};

describe("semantic ask repair", () => {
  it("retries when the first plan uses count + textSearch", async () => {
    let call = 0;
    const runtime: OntologyQueryRuntime = {
      queryObjects: async () => ({
        objectId: "contract",
        columns: ["count"],
        rows: [{ count: 121416 }],
        rowCount: 1,
        sql: "SELECT COUNT(*) ...",
      }),
    };
    const engine = createSemanticChatEngine({
      ontology,
      queryRuntime: runtime,
      translate: async () => {
        call += 1;
        if (call === 1) {
          return JSON.stringify({
            route: "single",
            objectQuery: {
              entityId: "contract",
              mode: "count",
              filters: [],
              textSearch: { query: "Quanti contratti ci sono?", columns: ["oggetto_gara"] },
            },
          });
        }
        return JSON.stringify({
          route: "single",
          objectQuery: {
            entityId: "contract",
            mode: "count",
            filters: [],
          },
        });
      },
    });

    const answer = await engine.ask("Quanti contratti ci sono?");
    expect(call).toBe(2);
    expect(answer.attempts).toBe(2);
    expect(answer.result.rows[0]).toEqual({ count: 121416 });
    expect(answer.plan.objectQuery.textSearch).toBeUndefined();
  });
});
