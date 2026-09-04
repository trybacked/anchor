<div align="center">

  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-white.png">
    <img alt="Anchor" src="docs/assets/logo-black.png" width="400">
  </picture>

  <p>
    <strong>The institutional memory of every organization</strong><br>
    Open protocol for organizational semantic models · Reference implementation by <a href="https://github.com/trybacked">Backed</a>
  </p>

  <p>
    <a href="./LICENSE"><img alt="License: Apache 2.0" src="https://img.shields.io/badge/License-Apache_2.0-blue?style=for-the-badge"></a>
    <a href="https://www.typescriptlang.org"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white"></a>
    <img alt="modello.yaml v1" src="https://img.shields.io/badge/modello.yaml-v1-CB3837?style=for-the-badge">
    <img alt="MCP" src="https://img.shields.io/badge/MCP-stdio-000000?style=for-the-badge">
  </p>

</div>

**Anchor** is an open protocol for organizational semantic models — and this repository is its reference implementation.

Every organization runs on data spread across systems that were never built to share a vocabulary. ERP, exports, spreadsheets, and documents each tell a partial story; without a shared layer of meaning, humans argue over definitions and agents invent new ones every session.

Anchor does not move data or replace systems. It builds the **ontology layer** above them — the same primitive enterprise platforms treat as foundational: map sources to **entities**, wire **relations**, capture **business definitions**, and govern what is true with provenance and confidence. That layer *is* institutional memory when it is written down, versioned, and shared. The output is **`modello.yaml`**: a committable semantic model. Humans confirm what the machine is unsure about through risk-ranked review; agents query what has been confirmed through MCP.

| | |
|---|---|
| **Anchor** | Protocol + this repo |
| **Backed** | Company — maintenance, commercial service |
| **`modello.yaml`** | Protocol artifact (the output) |
| **`backed`** | CLI command (reference implementation) |

---

## Why

Organizations have data everywhere and meaning nowhere. Three systems disagree on customer count because *customer* was never defined — not in the database, but in the ontology that should sit above it.

Anchor brings that layer within reach for ordinary organizations: local-first, evidence-backed, and small enough to stay true.

---

## How it works

```
sources/     Your files (read-only, never modified)
  ↓ ingest    DuckDB — encoding, delimiters, decimal locales detected and reported
  ↓ profile   SQL statistics → profile.json (no LLM)
  ↓ semantic  Two agentic bursts → proposal.json
  ↓ review    Risk-ranked questions for every uncertain element → review.json
modello.yaml  Anchor model
  ↓ serve     MCP stdio — agents query the ontology
  ↓ diff      Compare runs when sources change
```

**Ingest** reads sources in place via DuckDB. Non-UTF-8 encodings, semicolon delimiters, and European decimal commas are handled automatically; anomalies are always reported with file provenance. **ZIP/RAR** archives are extracted and scanned recursively. **PDFs** use embedded text when available, then **OCR** for scanned documents (requires [Poppler](https://poppler.freedesktop.org/) — `pdftoppm` on PATH; `brew install poppler` on macOS). Plain **TXT/MD** and **DOCX** are ingested as line-level tables.

**Profile** produces reproducible statistical evidence per column: null rates, distinct counts, patterns, candidate keys. Cross-column value overlap surfaces deterministic foreign-key candidates. No LLM participates. This evidence is the sole input to semantic inference.

**Semantic inference** runs two schema-constrained bursts: column classification (cheap model), then ontology proposal (frontier model). The LLM sees compressed profiles, never raw rows. *"I don't know"* is valid output. Proposals referencing tables or columns absent from the profile are dropped and surfaced as doubts.

**Review** asks human confirmation for every element with **confidence below `REVIEW_CONFIDENCE_THRESHOLD`** (default `0.95`), ordered by **risk = impact × uncertainty**. High-confidence inferences pass through as `proposed` without a prompt. Each question includes profile evidence. Answers: Yes · No · Rename.

**Consumption** exposes the model over MCP (`list_entities`, `get_entity`, `list_relations`, `search_model`) for Cursor, Claude Desktop, and custom agent runtimes.

---

## The model

`modello.yaml` contains no data. It contains the **model of the data** — portable, committable, schema-validated (`SemanticModelSchema` in `@backed/core`).

A typical organization: **4–15 entities**, **5–20 relations**, a handful of rules. Larger models usually signal inference error, not richness.

### Primitives

| Primitive | YAML key | Anchored to |
|---|---|---|
| Entity | `entities` | Source table |
| Property | `entities[].properties` | Source column |
| Relation | `relations` | Column pair (`fromColumn` → `toColumn`) |
| Rule | `rules` | Entity (+ optional column) |
| Action | `actions` | Reserved for writeback (empty in v1) |

Property semantic types: `text` · `number` · `amount` · `date` · `boolean` · `identifier` · `email` · `vat_number` · `fiscal_code` · `category`

Property roles: `primary_key` · `foreign_key` · `attribute`

Relation cardinality: `one_to_one` · `one_to_many` · `many_to_many`

Every element carries **`confidence`** (0–1), **`provenance`** (table, optional column, evidence sentence), and **`status`**:

| Status | Meaning |
|---|---|
| `proposed` | Inferred, not explicitly reviewed |
| `confirmed` | Accepted (Yes) |
| `renamed` | Accepted with corrected label (Rename) |

Rejected elements (No) are omitted. Below confidence threshold 0.7, elements become doubts or review questions — never silent facts.

### Example

```yaml
metadata:
  formatVersion: "1"
  runId: 20260903T191233-4f2a
  generatedAt: 2026-09-03T19:12:33.000Z

entities:
  - id: customer
    name: Customer
    sourceTable: customers
    status: confirmed
    confidence: 0.95
    provenance:
      table: customers
      evidence: "8 rows, candidate key id, identity columns"
    properties:
      - name: VAT Number
        columnName: vat_number
        semanticType: vat_number
        role: attribute
        confidence: 0.98
        provenance:
          table: customers
          column: vat_number
          evidence: "VAT pattern on 100% of sampled values"

relations:
  - id: invoice-customer
    name: Invoice issued to Customer
    fromEntity: invoice
    toEntity: customer
    fromColumn: customer_id
    toColumn: id
    cardinality: one_to_many
    status: confirmed
    confidence: 0.9

rules:
  - id: invoice-overdue
    name: Overdue invoice
    definition: An invoice is overdue when status equals "overdue".
    appliesTo: invoice
    column: status
    status: proposed
    confidence: 0.7

actions: []
```

### Run artifacts

Each pipeline run stores intermediate artifacts under `.backed/runs/<run-id>/`:

| File | Contents |
|---|---|
| `profile.json` | Statistical evidence |
| `proposal.json` | LLM proposal + doubts + review questions |
| `review.json` | Human answers |
| `modello.yaml` | Final model (workspace root) |
| `diff.json` | Changes vs previous run |

All files are schema-validated on read and write.

### Workspace layout

```
<workspace>/
├── sources/                 # Your data — read-only for Anchor
├── modello.yaml             # Anchor model
└── .backed/
    ├── config.yaml
    └── runs/<run-id>/
        ├── profile.json
        ├── proposal.json
        ├── review.json
        └── diff.json
```

---

## CLI

| Command | Purpose |
|---|---|
| `backed init [folder]` | Initialize workspace (default sources: `./sources`) |
| `backed model [folder]` | Full pipeline: ingest → profile → proposal. Re-runs use **incremental inference** when `modello.yaml` exists (only changed tables hit the LLM). Pass `--full` to re-infer everything. |
| `backed review` | Interactive review → writes `modello.yaml` |
| `backed diff` | Compare last two runs |
| `backed serve` | MCP stdio server on the current model |

```bash
mkdir -p sources
backed init ./sources
backed model
backed review
backed serve
```

When sources change: `backed model && backed diff` (incremental by default)

---

## Install

**Requirements:** Node.js ≥ 22 · pnpm · [Vercel AI Gateway](https://vercel.com/ai-gateway) API key

```bash
git clone https://github.com/<org>/anchor.git
cd anchor && pnpm install && pnpm build
cd apps/cli && pnpm link --global
```

If another `backed` binary exists on your machine (e.g. a Rust tool in `~/.cargo/bin`), ensure `~/Library/pnpm` is **before** `~/.cargo/bin` in your `PATH`, then run `hash -r` and check with `which backed`.

Create `.env` in your **workspace root** (the folder containing `.backed/`, or any parent of your cwd — Anchor walks up to find it):

```bash
AI_GATEWAY_API_KEY=...                          # required
REVIEW_CONFIDENCE_THRESHOLD=0.95                # optional — review when confidence is below this
# SEMANTIC_MODEL_CHEAP=openai/gpt-5-mini
# SEMANTIC_MODEL_FRONTIER=anthropic/claude-sonnet-4.5
```

See [.env.example](./.env.example).

Licensed under [Apache-2.0](./LICENSE).

---

## Development

```bash
pnpm install && pnpm build
pnpm cli --help
```

Monorepo: `@backed/core` → `ingest` → `profile` → `semantic` → `diff` / `mcp` → `apps/cli`.

---

## Scope

**In (v1):** Anchor format · CLI · profiling · agentic inference · bounded review · run diff · MCP export.

**Out (v1):** Hosted cloud · SDK · registry · billing · dashboard · writeback · incremental re-inference on diff.

**Not Anchor:** ETL · warehouse · ERP · chatbot · connector marketplace.

**Status:** Full pipeline operational. Validating on real organization export folders.

---

<p align="center">
  <sub>Anchor v1 · Reference implementation by Backed</sub>
</p>
