import type { DocumentParser } from "@trybacked/ports";
import { createDoclingDocumentParser } from "./docling-parser.js";
import { createNodeDocumentParser } from "./node-parsers.js";

export function createDocumentParserFromEnv(env: NodeJS.ProcessEnv): DocumentParser {
  const doclingUrl = env["DOCLING_URL"]?.trim();
  const node = createNodeDocumentParser();
  if (doclingUrl === undefined || doclingUrl.length === 0) {
    return node;
  }
  const docling = createDoclingDocumentParser(doclingUrl);
  return {
    supportedMimeTypes: [...new Set([...node.supportedMimeTypes, ...docling.supportedMimeTypes])],
    async parse(input) {
      const preferDocling =
        input.mimeType.includes("pdf") ||
        input.mimeType.includes("word") ||
        input.mimeType.includes("presentation");
      if (preferDocling) {
        try {
          return await docling.parse(input);
        } catch {
          return node.parse(input);
        }
      }
      return node.parse(input);
    },
  };
}
