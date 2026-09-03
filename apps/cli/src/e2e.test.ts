/**
 * End-to-end pipeline test on fixtures/pmi-minimal with mock LLMs (no network):
 * ingest → profile → proposal → simulated review → modello.yaml → second run → diff.
 */

import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ProfileReportSchema,
  ProposalSchema,
  applyReview,
  createRunId,
  initWorkspace,
  listRunIds,
  readModelYaml,
  readRunArtifact,
  writeModelYaml,
  writeRunArtifact,
} from "@backed/core";
import type { ProfileReport, Proposal, Review, ReviewAnswer } from "@backed/core";
import { diffRuns } from "@backed/diff";
import type { RunSnapshot } from "@backed/diff";
import { ingestFolder } from "@backed/ingest";
import { listEntities, searchModel } from "@backed/mcp";
import { profileTables } from "@backed/profile";
import { proposeModel } from "@backed/semantic";
import { MockLanguageModelV3 } from "ai/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/pmi-minimal",
);

function mockModel(object: unknown): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: {
      content: [{ type: "text", text: JSON.stringify(object) }],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 50, text: 50, reasoning: 0 },
      },
      warnings: [],
    },
  });
}

const CLASSIFICATION = {
  tables: [
    {
      table: "fatture",
      columns: [
        { column: "cliente_id", label: "Cliente", semanticType: "identifier", role: "foreign_key", confidence: 0.85 },
        { column: "stato", label: "Stato", semanticType: "category", role: "attribute", confidence: 0.9 },
      ],
    },
  ],
};

function ontologyEntities(includeProdotto: boolean): Record<string, unknown>[] {
  const entities = [
    {
      id: "cliente",
      name: "Cliente",
      description: "Anagrafica clienti.",
      sourceTable: "clienti",
      confidence: 0.94,
      evidence: "Colonne anagrafiche e partita IVA.",
    },
    {
      id: "fattura",
      name: "Fattura",
      description: "Fatture emesse.",
      sourceTable: "fatture",
      confidence: 0.9,
      evidence: "Numero, data, importo, stato.",
    },
  ];
  if (includeProdotto) {
    entities.push({
      id: "prodotto",
      name: "Prodotto",
      description: "Listino prodotti.",
      sourceTable: "prodotti",
      confidence: 0.85,
      evidence: "Codice, descrizione, prezzo.",
    });
  }
  return entities;
}

function buildOntology(includeProdotto: boolean): Record<string, unknown> {
  return {
    entities: ontologyEntities(includeProdotto),
    relations: [
      {
        id: "fattura-cliente",
        name: "Fattura emessa a Cliente",
        fromEntity: "fattura",
        toEntity: "cliente",
        fromColumn: "cliente_id",
        toColumn: "id",
        cardinality: "one_to_many",
        confidence: 0.5,
        evidence: "cliente_id riferisce clienti.id.",
      },
    ],
    rules: [
      {
        id: "fattura-insoluta",
        name: "Fattura insoluta",
        definition: 'Una fattura è insoluta quando lo stato vale "insoluta".',
        appliesTo: "fattura",
        column: "stato",
        confidence: 0.6,
        evidence: "3 distinct values in status.",
      },
    ],
    doubts: [],
  };
}

async function runModelPipeline(
  root: string,
  sourcesDir: string,
  ontology: Record<string, unknown>,
): Promise<{ runId: string; profile: ProfileReport; proposal: Proposal }> {
  const session = await ingestFolder(sourcesDir);
  try {
    const profile = await profileTables(session);
    const runId = createRunId();
    writeRunArtifact(root, runId, "profile", profile);
    const proposal = await proposeModel({
      profile,
      runId,
      models: { cheap: mockModel(CLASSIFICATION), frontier: mockModel(ontology) },
    });
    writeRunArtifact(root, runId, "proposal", proposal);
    return { runId, profile, proposal };
  } finally {
    session.close();
  }
}

function toSnapshot(root: string, runId: string): RunSnapshot {
  const profile = readRunArtifact(root, runId, "profile", ProfileReportSchema);
  const proposal = readRunArtifact(root, runId, "proposal", ProposalSchema);
  return {
    runId,
    profile,
    model: { entities: proposal.entities, relations: proposal.relations, rules: proposal.rules },
  };
}

let root: string;
let sourcesDir: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "backed-e2e-"));
  sourcesDir = path.join(root, "sources");
  cpSync(FIXTURE_DIR, sourcesDir, { recursive: true });
  initWorkspace(root, { sourcesDir: "./sources" });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("pipeline end-to-end (mock LLM)", () => {
  it("model → proposal → review → modello.yaml → seconda run → diff", async () => {
    // Run 1: model
    const first = await runModelPipeline(root, sourcesDir, buildOntology(true));
    expect(first.proposal.entities.map((entity) => entity.id).sort()).toEqual([
      "cliente",
      "fattura",
      "prodotto",
    ]);
    expect(first.proposal.questions.length).toBeGreaterThan(0);

    // Simulated review: yes to everything, rename cliente, reject the rule.
    const answers: ReviewAnswer[] = first.proposal.questions.map((question) => {
      if (question.kind === "rule") {
        return { questionId: question.id, decision: "no" };
      }
      if (question.targetId === "cliente") {
        return { questionId: question.id, decision: "rename", newName: "Cliente attivo" };
      }
      return { questionId: question.id, decision: "yes" };
    });
    const review: Review = {
      runId: first.runId,
      answeredAt: new Date().toISOString(),
      answers,
    };
    writeRunArtifact(root, first.runId, "review", review);

    const model = applyReview(first.proposal, review);
    writeModelYaml(root, model);

    // modello.yaml round-trip and review effects
    const persisted = readModelYaml(root);
    const cliente = persisted.entities.find((entity) => entity.id === "cliente");
    expect(cliente?.name).toBe("Cliente attivo");
    expect(cliente?.status).toBe("renamed");
    expect(persisted.rules).toHaveLength(0);
    expect(persisted.relations.map((relation) => relation.status)).toEqual(["confirmed"]);

    // MCP mapping on the confirmed model
    expect(listEntities(persisted).map((entity) => entity.id).sort()).toEqual([
      "cliente",
      "fattura",
      "prodotto",
    ]);
    expect(searchModel(persisted, "partita").length).toBeGreaterThan(0);

    // Data drift: a new table appears, prodotti disappears.
    rmSync(path.join(sourcesDir, "prodotti.csv"));
    writeFileSync(
      path.join(sourcesDir, "pagamenti.csv"),
      "id,fattura_numero,importo,data\n1,2024-0001,1250.00,2024-01-31\n",
      "utf-8",
    );

    // Run 2: model on drifted data (ontology no longer sees prodotto).
    const second = await runModelPipeline(root, sourcesDir, buildOntology(false));

    const runIds = listRunIds(root);
    expect(runIds).toEqual([first.runId, second.runId].sort());

    const diff = diffRuns(toSnapshot(root, first.runId), toSnapshot(root, second.runId));
    const kinds = diff.changes.map((change) => change.kind);
    expect(kinds).toContain("table_added");
    expect(kinds).toContain("table_removed");
    expect(kinds).toContain("entity_removed");
    expect(diff.changes.find((change) => change.kind === "table_added")?.subject).toBe(
      "pagamenti",
    );
    expect(diff.changes.find((change) => change.kind === "entity_removed")?.subject).toBe(
      "prodotto",
    );
  }, 60_000);
});
