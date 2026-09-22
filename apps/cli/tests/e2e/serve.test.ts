import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";
import { CLI_PATH, NODE_EXECUTABLE, PMI_MINIMAL_FIXTURE } from "../helpers/paths.js";

function parseToolJson(result: Awaited<ReturnType<Client["callTool"]>>): unknown {
  const content = result.content as Array<{ type: string; text?: string }>;
  const block = content[0];
  if (block === undefined || block.type !== "text" || block.text === undefined) {
    throw new Error("Expected text MCP response");
  }
  return JSON.parse(block.text);
}

async function withMcpClient<T>(cwd: string, run: (client: Client) => Promise<T>): Promise<T> {
  const transport = new StdioClientTransport({
    command: NODE_EXECUTABLE,
    args: [CLI_PATH, "anchor", "deploy"],
    cwd,
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
  });
  const client = new Client({ name: "serve-e2e", version: "0.0.0" });
  await client.connect(transport);
  try {
    return await run(client);
  } finally {
    await client.close();
  }
}

describe("backed anchor deploy e2e", () => {
  it("runs the five MCP operations on pmi-minimal", async () => {
    await withMcpClient(PMI_MINIMAL_FIXTURE, async (client) => {
      const entities = parseToolJson(
        await client.callTool({ name: "list_entities", arguments: {} }),
      );
      expect(entities).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "cliente", status: "confirmed" })]),
      );
      const entity = parseToolJson(
        await client.callTool({ name: "get_entity", arguments: { id: "cliente" } }),
      );
      expect(entity).toEqual(
        expect.objectContaining({
          id: "cliente",
          properties: expect.arrayContaining([
            expect.objectContaining({ semanticType: "vat_number", role: "attribute" }),
          ]),
        }),
      );
      const relations = parseToolJson(
        await client.callTool({ name: "list_relations", arguments: { id: "fattura" } }),
      );
      expect(relations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "fattura-cliente", cardinality: "one_to_many" }),
        ]),
      );
      const search = parseToolJson(
        await client.callTool({ name: "search_model", arguments: { query: "cliente" } }),
      );
      expect(search).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: "entity", id: "cliente" })]),
      );
      const definition = parseToolJson(
        await client.callTool({ name: "get_definition", arguments: { term: "fattura scaduta" } }),
      );
      expect(definition).toEqual(
        expect.objectContaining({
          found: true,
          id: "fattura-scaduta",
          status: "confirmed",
        }),
      );
    });
  });
});
