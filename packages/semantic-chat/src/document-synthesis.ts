import { isServiceErrorResult, type AnchorService } from "@trybacked/service";
import { generateText } from "ai";
import { randomUUID } from "node:crypto";
import type { SemanticAskResponse } from "@trybacked/service";
import {
  normalizeChunkText,
  primaryDocumentSearchPhrase,
  rankDocumentSearchRows,
} from "./document-evidence.js";
import { documentSearchQueries, PROCUREMENT_KEYWORDS } from "./document-intent.js";
import type { ModelResolver } from "./agent/run-agent.js";

const MIN_EVIDENCE_CHARS = 380;
const MAX_CONTEXT_CHARS = 14_000;
const MAX_EXCERPT_PER_BLOCK = 2_400;
const CHUNK_SEARCH_LIMIT = 18;

type EvidenceBlock = {
  filename: string;
  folder: string | null;
  page: number | null;
  text: string;
};

function readString(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function rowToEvidenceBlock(record: Record<string, unknown>): EvidenceBlock | undefined {
  const text = normalizeChunkText(record);
  if (text.length < 24) {
    return undefined;
  }
  return {
    filename: readString(record, "filename") ?? "documento",
    folder: readString(record, "folder") ?? null,
    page: typeof record.page === "number" ? record.page : null,
    text,
  };
}

export async function collectDocumentEvidence(
  service: AnchorService,
  question: string,
): Promise<EvidenceBlock[]> {
  const merged = new Map<string, EvidenceBlock>();
  for (const query of documentSearchQueries(question)) {
    const search = await service.chunkSearch({ query, limit: CHUNK_SEARCH_LIMIT });
    if (isServiceErrorResult(search)) {
      continue;
    }
    const rows = (search.rows ?? []).filter(
      (row): row is Record<string, unknown> => typeof row === "object" && row !== null,
    );
    for (const record of rankDocumentSearchRows(rows, question)) {
      const elementId = readString(record, "elementId") ?? readString(record, "element_id");
      const block = rowToEvidenceBlock(record);
      if (block === undefined) {
        continue;
      }
      const key = elementId ?? `${readString(record, "documentId") ?? ""}:${block.text.slice(0, 80)}`;
      const existing = merged.get(key);
      if (existing !== undefined && existing.text.length >= block.text.length) {
        continue;
      }
      merged.set(key, block);
    }
  }
  return [...merged.values()];
}

async function profileContextSection(
  service: AnchorService,
  question: string,
): Promise<string | undefined> {
  if (!service.capabilities().entityProfile) {
    return undefined;
  }
  const name = primaryDocumentSearchPhrase(question);
  if (name.split(/\s+/).filter((part) => part.length > 0).length < 2) {
    return undefined;
  }
  const result = await service.entityProfile({ name, matchLimit: 3, documentLimit: 6 });
  if (isServiceErrorResult(result)) {
    return undefined;
  }
  const profile = result.profile;
  const lines: string[] = [];
  for (const match of profile.matches.slice(0, 3)) {
    lines.push(`- ${match.objectName}: ${JSON.stringify(match.row)}`);
  }
  for (const doc of profile.documents.slice(0, 4)) {
    const title = doc.filename ?? doc.documentId;
    lines.push(`- Documento: ${title} (${String(doc.hitCount)} passaggi)`);
    if (doc.snippet.length > 0) {
      lines.push(`  ${doc.snippet}`);
    }
  }
  return lines.length > 0 ? `Profilo strutturato:\n${lines.join("\n")}` : undefined;
}

export function totalEvidenceChars(blocks: readonly EvidenceBlock[]): number {
  return blocks.reduce((sum, block) => sum + block.text.length, 0);
}

function buildEvidenceContext(blocks: readonly EvidenceBlock[]): string {
  const lines: string[] = [];
  let used = 0;
  for (const [index, block] of blocks.entries()) {
    const headerParts = [`[${String(index + 1)}] ${block.filename}`];
    if (block.folder !== null) {
      headerParts.push(`cartella ${block.folder}`);
    }
    if (block.page !== null) {
      headerParts.push(`pag. ${String(block.page)}`);
    }
    const excerpt = block.text.slice(0, MAX_EXCERPT_PER_BLOCK);
    const chunk = `${headerParts.join(" · ")}\n${excerpt}`;
    if (used + chunk.length > MAX_CONTEXT_CHARS) {
      break;
    }
    lines.push(chunk);
    used += chunk.length;
  }
  return lines.join("\n\n");
}

function synthesisSystemPrompt(locale: string | undefined): string {
  const italian = (locale ?? "it").toLowerCase().startsWith("it");
  if (italian) {
    return [
      "Sei un assistente che risponde solo usando gli estratti documentali forniti.",
      "Scrivi in italiano, tono professionale e conciso (2–6 frasi o brevi elenchi).",
      "Estrai fatti concreti (titoli, ruoli, esperienze, date) quando compaiono nel testo.",
      "Cita i file sorgente tra parentesi con il nome file.",
      "Non dire che i dettagli mancano se gli estratti li contengono. Non inventare oltre il testo.",
    ].join(" ");
  }
  return [
    "You answer only from the supplied document excerpts.",
    "Be concise and professional; extract concrete facts when present.",
    "Cite source filenames in parentheses. Do not invent beyond the excerpts.",
  ].join(" ");
}

export async function synthesizeAnswerFromDocumentEvidence(options: {
  question: string;
  locale?: string | undefined;
  blocks: readonly EvidenceBlock[];
  profileSection?: string | undefined;
  resolveModel: ModelResolver;
  modelId: string;
}): Promise<string> {
  const context = buildEvidenceContext(options.blocks);
  const generation = await generateText({
    model: options.resolveModel(options.modelId),
    system: synthesisSystemPrompt(options.locale),
    prompt: `Domanda: ${options.question}\n\n${options.profileSection !== undefined ? `${options.profileSection}\n\n` : ""}Estratti:\n${context}`,
    temperature: 0.2,
    maxOutputTokens: 900,
  });
  return generation.text.trim();
}

export type DocumentSynthesisOutcome =
  | { kind: "answered"; response: SemanticAskResponse }
  | { kind: "skip"; reason: "no_capability" | "procurement" | "insufficient_evidence" | "empty_answer" };

export async function tryDocumentSynthesisAnswer(options: {
  service: AnchorService;
  question: string;
  locale?: string | undefined;
  ontologyVersion: number;
  resolveModel: ModelResolver;
  modelId: string;
}): Promise<DocumentSynthesisOutcome> {
  if (!options.service.capabilities().chunkSearch) {
    return { kind: "skip", reason: "no_capability" };
  }
  if (PROCUREMENT_KEYWORDS.test(options.question)) {
    return { kind: "skip", reason: "procurement" };
  }
  const started = Date.now();
  const [blocks, profileSection] = await Promise.all([
    collectDocumentEvidence(options.service, options.question),
    profileContextSection(options.service, options.question),
  ]);
  if (totalEvidenceChars(blocks) < MIN_EVIDENCE_CHARS && profileSection === undefined) {
    return { kind: "skip", reason: "insufficient_evidence" };
  }
  const answer = await synthesizeAnswerFromDocumentEvidence({
    question: options.question,
    locale: options.locale,
    blocks,
    profileSection,
    resolveModel: options.resolveModel,
    modelId: options.modelId,
  });
  if (answer.length === 0) {
    return { kind: "skip", reason: "empty_answer" };
  }
  const runId = randomUUID();
  return {
    kind: "answered",
    response: {
      text: answer,
      answer,
      question: options.question,
      runId,
      route: "document-synthesis",
      ontologyVersion: options.ontologyVersion,
      attempts: 1,
      claims: [],
      assumptions: [],
      followUps: [],
      agentSteps: [
        {
          toolCallId: "document-synthesis",
          toolName: "search_documents",
          input: { queries: documentSearchQueries(options.question), limit: CHUNK_SEARCH_LIMIT },
          status: "ok",
          rowCount: blocks.length,
          durationMs: Date.now() - started,
        },
      ],
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        latencyMs: Date.now() - started,
      },
    },
  };
}
