import { createGatewayModelResolver } from "../../src/agent/run-agent.js";
import { tryDocumentSynthesisAnswer } from "../../src/document-synthesis.js";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { AnchorService } from "@trybacked/service";

const e2eDir = dirname(fileURLToPath(import.meta.url));
const anchorRoot = resolve(e2eDir, "../../../..");
const corpusDir = process.env["PDF_CORPUS_DIR"]?.trim() ?? join(anchorRoot, "research", "library");
const maxPdfBytes = 3 * 1024 * 1024;

function loadDotEnv(path: string): void {
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}
loadDotEnv(join(anchorRoot, ".env"));

function pdftotextAvailable(): boolean {
  const probe = spawnSync("pdftotext", ["-v"]);
  return !probe.error;
}

const modelApiKey = process.env["AI_GATEWAY_API_KEY"]?.trim();
const modelId = process.env["SEMANTIC_MODEL"]?.trim();
const e2eEnabled =
  process.env["SEMANTIC_DOCUMENT_E2E"] === "1" &&
  existsSync(corpusDir) &&
  pdftotextAvailable() &&
  modelApiKey !== undefined &&
  modelApiKey.length > 0 &&
  modelId !== undefined &&
  modelId.length > 0;

type PdfChunk = {
  documentId: string;
  filename: string;
  folder: string;
  page: number;
  text: string;
};

function listPdfFiles(dir: string, base: string): { path: string; folder: string }[] {
  const found: { path: string; folder: string }[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      found.push(...listPdfFiles(full, base));
      continue;
    }
    if (name.toLowerCase().endsWith(".pdf") && statSync(full).size <= maxPdfBytes) {
      found.push({ path: full, folder: dirname(full).replace(base, "").replace(/^\//, "") });
    }
  }
  return found;
}

function extractChunks(pdfPath: string): string[] {
  const text = execFileSync("pdftotext", ["-enc", "UTF-8", "-q", pdfPath, "-"], {
    encoding: "utf-8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return text
    .split("\f")
    .map((page) => page.replace(/\s+/g, " ").trim())
    .filter((page) => page.length >= 80);
}

const MAX_CHUNKS_PER_DOC = 6;
const CHUNK_TARGET_CHARS = 1_200;

function chunkCorpus(): PdfChunk[] {
  const pdfs = listPdfFiles(corpusDir, corpusDir)
    .sort((left, right) => statSync(left.path).size - statSync(right.path).size)
    .slice(0, 4);
  const chunks: PdfChunk[] = [];
  for (const pdf of pdfs) {
    const pages = extractChunks(pdf.path);
    const taken = Math.min(pages.length, MAX_CHUNKS_PER_DOC);
    for (let index = 0; index < taken; index += 1) {
      const text = pages[index]?.slice(0, CHUNK_TARGET_CHARS) ?? "";
      if (text.length === 0) continue;
      chunks.push({
        documentId: pdf.path,
        filename: pdf.path.split("/").pop() ?? pdf.path,
        folder: pdf.folder,
        page: index + 1,
        text,
      });
    }
  }
  return chunks;
}

function keywordScore(text: string, terms: readonly string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const remaining = lower.split(term).join("");
    score += (lower.length - remaining.length) / Math.max(term.length, 1);
  }
  return score;
}

function chunkSearchOverCorpus(chunks: readonly PdfChunk[]) {
  return async (input: { query: string; limit?: number | undefined }) => {
    const terms = input.query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length >= 2);
    const limit = input.limit ?? 12;
    const scored = chunks
      .map((chunk, index) => ({
        elementId: `chunk-${String(index)}`,
        documentId: chunk.documentId,
        filename: chunk.filename,
        folder: chunk.folder,
        elementType: "text",
        page: chunk.page,
        content: chunk.text,
        score: keywordScore(chunk.text, terms),
      }))
      .filter((row) => row.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
    return { rows: scored, rowCount: scored.length };
  };
}

function corpusService(chunks: readonly PdfChunk[]): AnchorService {
  return {
    capabilities: () => ({ chunkSearch: true }),
    chunkSearch: chunkSearchOverCorpus(chunks),
    entityProfile: async () => ({ profile: { matches: [], documents: [] } }),
  } as unknown as AnchorService;
}

let corpus: PdfChunk[] = [];
const RESOLVE_MODEL = () => createGatewayModelResolver(modelApiKey ?? "")(modelId ?? "");

beforeAll(() => {
  corpus = chunkCorpus();
});

describe.skipIf(!e2eEnabled)("document synthesis on real PDFs (e2e)", () => {
  it("extracts real text from the PDF corpus", () => {
    expect(corpus.length).toBeGreaterThan(4);
    const survey = corpus.find((chunk) =>
      chunk.filename.includes("retrieval-augmented-generation"),
    );
    expect(survey).toBeDefined();
    expect(survey?.text.toLowerCase()).toContain("retrieval");
  }, 60_000);

  it("answers a grounded question with citations and ranks the RAG survey first", async () => {
    const outcome = await tryDocumentSynthesisAnswer({
      service: corpusService(corpus),
      question: "What is retrieval augmented generation?",
      documentTerms: [],
      locale: "it",
      ontologyVersion: 1,
      resolveModel: RESOLVE_MODEL,
      modelId: modelId ?? "",
      rerank: "llm",
    });
    expect(outcome.kind).toBe("answered");
    if (outcome.kind !== "answered") return;
    expect(outcome.response.route).toBe("document-synthesis");
    expect(outcome.response.answer).toMatch(/\[\d+\]/);
    const sources = outcome.response.sources ?? [];
    expect(sources.length).toBeGreaterThan(0);
    const firstSource = sources[0];
    expect(firstSource).toBeDefined();
    expect(firstSource?.title).toContain("retrieval-augmented-generation");
    expect((firstSource?.snippet ?? "").length).toBeGreaterThan(0);
  }, 180_000);

  it("abstains officially when the real corpus has nothing to do with the question", async () => {
    const outcome = await tryDocumentSynthesisAnswer({
      service: corpusService(corpus),
      question: "Chi ha vinto il campionato italiano di calcio nel 1982?",
      documentTerms: [],
      locale: "it",
      ontologyVersion: 1,
      resolveModel: RESOLVE_MODEL,
      modelId: modelId ?? "",
      abstainOnInsufficientEvidence: true,
      rerank: "llm",
    });
    expect(outcome.kind).toBe("abstained");
    if (outcome.kind !== "abstained") return;
    expect(outcome.response.outcome).toBe("abstained");
    expect(outcome.response.abstention?.reason).toBe("insufficient_evidence");
  }, 180_000);
});
