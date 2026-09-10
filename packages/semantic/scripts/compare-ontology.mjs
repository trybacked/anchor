#!/usr/bin/env node
/**
 * A/B compare: same questions with raw CSV only vs semantic model (MCP layer).
 *
 * Usage (from anchor/):
 *   pnpm compare:ontology          # all scenarios
 *   pnpm compare:ontology:simple   # SCAD + numeric only
 *   pnpm compare:ontology:complex  # ERP realistic multi-rule scenario
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createGateway } from "@ai-sdk/gateway";
import { Output, generateText } from "ai";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../../..");

const fixtureArg = process.argv.indexOf("--fixture");
const runAll = process.argv.includes("--all");
const runComplexOnly = process.argv.includes("--complex");
const runSimpleOnly = process.argv.includes("--simple");

const SIMPLE_QUESTIONS = (draftCode) => [
  {
    id: "overdue-count-rossi",
    question: "Quante fatture scadute ha il cliente Rossi?",
    grade: (a) => numeric(a) === 2,
    hint: "Mappare 'scaduta' → codice stato.",
  },
  {
    id: "overdue-total-rossi",
    question: "Qual è l'importo totale (EUR) delle fatture scadute di Rossi?",
    grade: (a) => numeric(a) === 1650,
    hint: "Definizione scaduta + join.",
  },
  {
    id: "draft-is-overdue",
    question: `Una fattura con cod_stato '${draftCode}' va considerata scaduta? Rispondi sì o no.`,
    grade: (a) => booleanAnswer(a) === false,
    hint: "Bozza ≠ scaduta.",
  },
  {
    id: "invoices-by-vat",
    question: "Quante fatture ha il cliente con partita IVA IT12345678901?",
    grade: (a) => numeric(a) === 3,
    hint: "Join senza regola business.",
  },
  {
    id: "bianchi-overdue",
    question: "Quante fatture scadute ha Bianchi SpA?",
    grade: (a) => numeric(a) === 0,
    hint: "Definizione scaduta + filtro cliente.",
  },
];

const COMPLEX_QUESTIONS = [
  {
    id: "rossi-overdue-count",
    question: "Quante fatture scadute ha Rossi Srl?",
    grade: (a) => numeric(a) === 3,
    hint: "Codici st_doc numerici ERP (20=scaduta solo nel modello).",
  },
  {
    id: "rossi-critical-overdue",
    question: "Quante fatture critiche scadute ha Rossi Srl?",
    grade: (a) => numeric(a) === 1,
    hint: "Regola composta: importo > 1000 AND scaduta — non inferibile.",
  },
  {
    id: "rossi-moroso",
    question: "Rossi Srl è un cliente moroso? Rispondi sì o no.",
    grade: (a) => booleanAnswer(a) === true,
    hint: "Moroso = più di 2 scadute (definizione org-specific).",
  },
  {
    id: "lombardia-overdue-total",
    question: "Qual è l'importo totale (EUR) delle fatture scadute dei clienti in Lombardia?",
    grade: (a) => numeric(a) === 2450,
    hint: "Join fatture→clienti + filtro regione + definizione scaduta.",
  },
  {
    id: "st-doc-40-overdue",
    question: "Un documento con st_doc=40 va considerato scaduto? Rispondi sì o no.",
    grade: (a) => booleanAnswer(a) === false,
    hint: "40= b ozza (proposed nel modello, non guessable as scaduta).",
  },
  {
    id: "bianchi-paid-count",
    question: "Quante fatture pagate ha Bianchi SpA?",
    grade: (a) => numeric(a) === 1,
    hint: "Pagata = st_doc 30 (solo nel modello).",
  },
  {
    id: "verdi-overdue-amount",
    question: "Qual è l'importo della fattura scaduta di Verdi & Co?",
    grade: (a) => numeric(a) === 300,
    hint: "Singolo match su cliente + scaduta.",
  },
];

const SCENARIOS = [
  {
    id: "erp-abbrev",
    label: "Codici ERP italiani (SCAD / PAG / BOZ)",
    fixture: "pmi-minimal",
    tier: "simple",
    draftCode: "BOZ",
  },
  {
    id: "numeric-enum",
    label: "Codici numerici (1 / 2 / 3)",
    fixture: "pmi-minimal-numeric",
    tier: "simple",
    draftCode: "3",
  },
  {
    id: "erp-complex",
    label: "ERP realistico — colonne criptiche, regole composite, morosità",
    fixture: "pmi-complex",
    tier: "complex",
    questions: COMPLEX_QUESTIONS,
  },
];

function resolveScenarios() {
  if (fixtureArg >= 0) {
    const name = process.argv[fixtureArg + 1];
    const match = SCENARIOS.find((s) => s.fixture === name);
    if (match) return [match];
    return [{ id: "custom", label: name, fixture: name, tier: "simple", draftCode: "BOZ" }];
  }
  if (runComplexOnly) return SCENARIOS.filter((s) => s.tier === "complex");
  if (runSimpleOnly) return SCENARIOS.filter((s) => s.tier === "simple");
  if (runAll) return SCENARIOS;
  return SCENARIOS;
}

const AnswerSchema = z.object({
  answer: z.union([z.number(), z.boolean(), z.string()]),
  reasoning: z.string(),
  status_filter_used: z.string().nullable(),
  join_used: z.string().nullable(),
});

function numeric(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function booleanAnswer(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (["sì", "si", "yes", "true"].includes(s)) return true;
    if (["no", "false"].includes(s)) return false;
  }
  return null;
}

function loadCsvBundle(fixturePath) {
  const sourcesDir = join(fixturePath, "sources");
  const files = readdirSync(sourcesDir)
    .filter((name) => name.endsWith(".csv"))
    .sort();
  return files
    .map((name) => {
      const body = readFileSync(join(sourcesDir, name), "utf8").trim();
      return `# ${name}\n${body}`;
    })
    .join("\n\n");
}

async function loadOntologyContext(fixturePath) {
  const { readModelYaml } = await import(pathToFileURL(join(REPO_ROOT, "packages/core/dist/index.js")).href);
  const { getDefinition, getEntity, listRelations, listEntities, searchModel } = await import(
    pathToFileURL(join(REPO_ROOT, "packages/mcp/dist/mapping.js")).href,
  );
  const model = readModelYaml(fixturePath);

  const confirmedRules = model.rules.filter((rule) => rule.status === "confirmed");
  const definitions = Object.fromEntries(
    confirmedRules.map((rule) => [rule.id, getDefinition(model, rule.name)]),
  );

  const entities = Object.fromEntries(
    model.entities.map((entity) => [entity.id, getEntity(model, entity.id)]),
  );

  return JSON.stringify(
    {
      entities: listEntities(model),
      entity_details: entities,
      relations: listRelations(model),
      confirmed_definitions: definitions,
      search_scaduta: searchModel(model, "scaduta"),
      search_moroso: searchModel(model, "moroso"),
      search_critica: searchModel(model, "critica"),
    },
    null,
    2,
  );
}

function systemWithout(complex) {
  if (complex) {
    return `Sei un assistente che risponde a domande su dati aziendali.
Hai SOLO export CSV da gestionale italiano: nomi colonna ERP (id_clifor, st_doc, importo_netto, …).
I codici numerici st_doc NON hanno legenda nel CSV. Puoi provare a inferire, ma non hai policy ufficiali.
Termini come "moroso", "critica scaduta" sono definizioni interne — non definiti nei dati grezzi.
Rispondi in JSON: answer, reasoning, status_filter_used, join_used.`;
  }
  return `Sei un assistente che risponde a domande su dati aziendali.
Hai SOLO export CSV grezzi da gestionale italiano.
Puoi inferire il significato dei codici se ti sembra ovvio, ma non hai un dizionario ufficiale.
Rispondi in JSON: answer, reasoning, status_filter_used, join_used.`;
}

function systemWith() {
  return `Sei un assistente che risponde a domande su dati aziendali.
Hai export CSV + modello semantico confermato (entities, relations, business definitions).
Usa SOLO definizioni confirmed per termini di business. Usa relations per i join.
Rispondi in JSON: answer, reasoning, status_filter_used, join_used.`;
}

async function ask(model, mode, csv, ontologyJson, question, complex) {
  const prompt =
    mode === "with"
      ? `## Modello semantico (MCP / model.yaml)\n${ontologyJson}\n\n## Dati CSV\n${csv}\n\n## Domanda\n${question}`
      : `## Dati CSV\n${csv}\n\n## Domanda\n${question}`;

  const result = await generateText({
    model,
    output: Output.object({ schema: AnswerSchema }),
    system: mode === "with" ? systemWith() : systemWithout(complex),
    prompt,
    temperature: 0,
    maxRetries: 1,
  });

  if (result.output === undefined) {
    throw new Error(`No structured output for question: ${question}`);
  }

  return result.output;
}

function printRow(label, value) {
  console.log(`${label.padEnd(22)} ${value}`);
}

function questionsForScenario(scenario) {
  if (scenario.questions !== undefined) return scenario.questions;
  return SIMPLE_QUESTIONS(scenario.draftCode ?? "BOZ");
}

async function runScenario(scenario, model) {
  const fixturePath = join(REPO_ROOT, "fixtures", scenario.fixture);
  const questions = questionsForScenario(scenario);
  const csv = loadCsvBundle(fixturePath);
  const ontologyJson = await loadOntologyContext(fixturePath);
  const complex = scenario.tier === "complex";

  console.log("══════════════════════════════════════════════════════════════");
  console.log(` SCENARIO: ${scenario.label}`);
  console.log(` Fixture:  fixtures/${scenario.fixture}`);
  console.log(` Domande:  ${String(questions.length)}`);
  console.log("══════════════════════════════════════════════════════════════\n");

  const summary = { without: 0, with: 0, total: questions.length };

  for (const item of questions) {
    console.log(`── ${item.id} ──`);
    console.log(`Q: ${item.question}`);
    console.log(`(${item.hint})\n`);

    const without = await ask(model, "without", csv, null, item.question, complex);
    const withOntology = await ask(model, "with", csv, ontologyJson, item.question, complex);

    const okWithout = item.grade(without.answer);
    const okWith = item.grade(withOntology.answer);

    if (okWithout) summary.without += 1;
    if (okWith) summary.with += 1;

    printRow("SENZA ontologia:", okWithout ? "✓ corretto" : "✗ sbagliato");
    printRow("  risposta:", String(without.answer));
    printRow("  status usato:", without.status_filter_used ?? "(none)");

    console.log("");
    printRow("CON ontologia:", okWith ? "✓ corretto" : "✗ sbagliato");
    printRow("  risposta:", String(withOntology.answer));
    printRow("  status usato:", withOntology.status_filter_used ?? "(none)");

    console.log("\n");
  }

  printRow("Senza ontologia:", `${summary.without}/${summary.total}`);
  printRow("Con ontologia:", `${summary.with}/${summary.total}`);
  const delta = summary.with - summary.without;
  if (delta > 0) {
    console.log(`→ Layer semantico: +${delta} risposte corrette\n`);
  } else if (delta < 0) {
    console.log(`→ Senza layer meglio di ${Math.abs(delta)} (inaspettato)\n`);
  } else {
    console.log("→ Pari\n");
  }

  return summary;
}

async function main() {
  const apiKey = process.env["AI_GATEWAY_API_KEY"]?.trim();
  if (!apiKey) {
    console.error("Set AI_GATEWAY_API_KEY in anchor/.env");
    process.exit(1);
  }

  const MODEL_ID = process.env["COMPARE_MODEL"]?.trim() || "anthropic/claude-sonnet-4";
  const gateway = createGateway({ apiKey });
  const model = gateway(MODEL_ID);
  const scenarios = resolveScenarios();

  console.log(" CONFRONTO A/B — Con vs Senza layer semantico");
  console.log(` Model: ${MODEL_ID}`);
  console.log(` Scenari: ${scenarios.map((s) => s.id).join(", ")}\n`);

  const totals = { without: 0, with: 0, total: 0 };

  for (const scenario of scenarios) {
    const result = await runScenario(scenario, model);
    totals.without += result.without;
    totals.with += result.with;
    totals.total += result.total;
  }

  if (scenarios.length > 1) {
    console.log("══════════════════════════════════════════════════════════════");
    console.log(" TOTALE (tutti gli scenari)");
    printRow("Senza ontologia:", `${totals.without}/${totals.total}`);
    printRow("Con ontologia:", `${totals.with}/${totals.total}`);
    console.log("══════════════════════════════════════════════════════════════\n");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
