import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { SemanticModel } from "@trybacked/core";
import { createModelMcpServer, type ModelMcpServerOptions } from "./server.js";

export type StreamableHttpMcpOptions = {
  port: number;
  model: SemanticModel;
  options?: ModelMcpServerOptions;
};

export async function runStreamableHttpMcpServer(config: StreamableHttpMcpOptions): Promise<void> {
  const app = createMcpExpressApp();
  const server = createModelMcpServer(config.model, config.options ?? {});
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });
  await server.connect(transport as Transport);
  app.all("/mcp", (req, res) => {
    void transport.handleRequest(req, res);
  });
  await new Promise<void>((resolve) => {
    const httpServer = app.listen(config.port, () => {
      resolve();
    });
    process.once("SIGINT", () => {
      void server.close().finally(() => {
        httpServer.close();
      });
    });
  });
}
