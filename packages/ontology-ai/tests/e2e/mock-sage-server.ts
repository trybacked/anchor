import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export type MockSageBatchResponse = {
  acceptAnswer: "yes" | "no" | null;
  acceptProbability: number;
  riskTags?: Array<{ id: string; applies: boolean | null; probability: number }>;
};

const DEFAULT_RESPONSE: MockSageBatchResponse = {
  acceptAnswer: "yes",
  acceptProbability: 0.95,
  riskTags: [
    { id: "duplicates_existing", applies: false, probability: 0.05 },
    { id: "naming_inconsistent", applies: false, probability: 0.05 },
    { id: "weak_evidence", applies: false, probability: 0.05 },
    { id: "semantic_mismatch", applies: false, probability: 0.05 },
    { id: "cardinality_doubt", applies: false, probability: 0.05 },
  ],
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function buildBatchJson(
  requestBody: string,
  template: MockSageBatchResponse,
): Record<string, unknown> {
  let groupCount = 1;
  try {
    const parsed = JSON.parse(requestBody) as { requests?: unknown[] };
    groupCount = Math.max(1, parsed.requests?.length ?? 1);
  } catch {
    groupCount = 1;
  }

  const yesnoResult = {
    id: "accept",
    kind: "yesno",
    result: {
      answer: template.acceptAnswer,
      probability: template.acceptProbability,
    },
  };
  const tagsResult = {
    id: "risks",
    kind: "tags",
    result: {
      tags: template.riskTags ?? DEFAULT_RESPONSE.riskTags,
    },
  };

  return {
    results: Array.from({ length: groupCount }, () => ({
      answers: [
        { ok: true, result: yesnoResult },
        { ok: true, result: tagsResult },
      ],
    })),
    meta: {
      model: "mock-sage-e2e",
      usage: { input_tokens: 100, output_tokens: 4, searches: 0 },
    },
  };
}

export type MockSageServer = {
  baseUrl: string;
  close: () => Promise<void>;
  requestCount: () => number;
};

export async function startMockSageServer(
  template: MockSageBatchResponse = DEFAULT_RESPONSE,
): Promise<MockSageServer> {
  let requests = 0;
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      if (req.method !== "POST" || req.url !== "/decide/batch") {
        res.statusCode = 404;
        res.end();
        return;
      }
      const auth = req.headers.authorization ?? "";
      if (!auth.startsWith("Bearer ")) {
        res.statusCode = 401;
        res.end();
        return;
      }
      requests += 1;
      const body = await readBody(req);
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 200;
      res.end(JSON.stringify(buildBatchJson(body, template)));
    })();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Mock Sage server failed to bind");
  }

  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    requestCount: () => requests,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error !== undefined ? reject(error) : resolve()));
      }),
  };
}
