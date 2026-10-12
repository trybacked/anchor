import { duckDbPathFromEnv, resolveWarehouseDuckDbPath } from "@trybacked/infrastructure";
import { hybridSearchChunks } from "@trybacked/ingest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { TOOL_NAMES } from "./constants.js";
import type { ToolContext, ToolDefinition } from "./tools.js";

const getEvidenceInputSchema = {
  objectId: z.string().min(1),
  propertyId: z.string().min(1),
  objectKey: z.string().min(1).optional(),
};

const summarizeCorpusInputSchema = {
  question: z.string().min(1),
  limit: z.number().int().positive().max(20).optional(),
};

type ParsedArtifact = {
  parsed: { uri: string; plainText: string };
  chunks: { text: string; documentUri: string }[];
};

function loadParsedArtifacts(workspaceHint: string | undefined): ParsedArtifact[] {
  if (workspaceHint === undefined || !existsSync(workspaceHint)) {
    return [];
  }
  return readdirSync(workspaceHint)
    .filter((name) => name.endsWith(".json"))
    .slice(0, 50)
    .map(
      (name) => JSON.parse(readFileSync(path.join(workspaceHint, name), "utf8")) as ParsedArtifact,
    );
}

// Signature matches other *ForContext factories; evidence tools use env paths today.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for workspace-scoped parsed dir
export function evidenceToolsForContext(_context: ToolContext): ToolDefinition[] {
  const parsedDir = process.env["BACKED_PARSED_DIR"];
  return [
    {
      name: TOOL_NAMES.getEvidence,
      title: "Get evidence",
      description: "Return source spans for an extracted property value when available.",
      inputSchema: getEvidenceInputSchema,
      handler: (_ctx, args) => {
        const input = z.object(getEvidenceInputSchema).parse(args);
        const artifacts = loadParsedArtifacts(parsedDir);
        for (const artifact of artifacts) {
          if (artifact.parsed.uri.includes(input.objectKey ?? input.objectId)) {
            return {
              objectId: input.objectId,
              propertyId: input.propertyId,
              documentUri: artifact.parsed.uri,
              excerpt: artifact.parsed.plainText.slice(0, 500),
              unanswerable: false,
            };
          }
        }
        return {
          objectId: input.objectId,
          propertyId: input.propertyId,
          unanswerable: true,
          message: "No evidence span found for the requested value.",
        };
      },
    },
    {
      name: TOOL_NAMES.summarizeCorpus,
      title: "Summarize corpus",
      description: "Answer global corpus questions using cluster-style chunk sampling.",
      inputSchema: summarizeCorpusInputSchema,
      handler: async (_ctx, args) => {
        const input = z.object(summarizeCorpusInputSchema).parse(args);
        const limit = input.limit ?? 8;
        const duckDbPath =
          duckDbPathFromEnv(process.env) ?? resolveWarehouseDuckDbPath(process.env);
        try {
          const hits = await hybridSearchChunks(duckDbPath, input.question, { limit });
          if (hits.length > 0) {
            return {
              question: input.question,
              unanswerable: false,
              themes: hits.map((hit, index) => ({
                id: `theme_${String(index)}`,
                excerpt: hit.text.slice(0, 400),
                documentUri: hit.documentUri,
                score: hit.score,
              })),
            };
          }
        } catch {
          // fall back to parsed artifacts
        }
        const artifacts = loadParsedArtifacts(parsedDir);
        const samples = artifacts
          .flatMap((artifact) => artifact.chunks.map((chunk) => chunk.text))
          .filter((text) =>
            text.toLowerCase().includes(input.question.toLowerCase().split(/\s+/)[0] ?? ""),
          )
          .slice(0, limit);
        if (samples.length === 0) {
          return {
            unanswerable: true,
            question: input.question,
            message: "Insufficient corpus evidence for a global summary.",
          };
        }
        return {
          question: input.question,
          unanswerable: false,
          themes: samples.map((text, index) => ({
            id: `theme_${String(index)}`,
            excerpt: text.slice(0, 400),
          })),
        };
      },
    },
  ];
}
