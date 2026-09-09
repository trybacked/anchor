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
    <img alt="model.yaml v1" src="https://img.shields.io/badge/model.yaml-v1-CB3837?style=for-the-badge">
    <img alt="MCP" src="https://img.shields.io/badge/MCP-stdio-000000?style=for-the-badge">
  </p>

</div>

**Anchor** is an open protocol for organizational semantic models — and this repository is its reference implementation.

Every organization runs on data spread across systems that were never built to share a vocabulary. ERP, exports, spreadsheets, and documents each tell a partial story; without a shared layer of meaning, humans argue over definitions and agents invent new ones every session.

Anchor does not move data or replace systems. It builds the **ontology layer** above them — the same primitive enterprise platforms treat as foundational: map sources to **entities**, wire **relations**, capture **business definitions**, and govern what is true with provenance and confidence. That layer *is* institutional memory when it is written down, versioned, and shared. The output is **`model.yaml`**: a committable semantic model. Humans confirm what the machine is unsure about through risk-ranked review; agents query what has been confirmed through MCP.

| | |
|---|---|
| **Anchor** | Protocol + this repo |
| **Backed** | Company — maintenance, commercial service |
| **`model.yaml`** | Protocol artifact (the output) |
| **`backed`** | CLI command (reference implementation) |

**Protocol artifacts:** [`schema/anchor-schema-v1.json`](./schema/anchor-schema-v1.json) (JSON Schema) · [`docs/MODEL-FORMAT-v1.md`](./docs/MODEL-FORMAT-v1.md) (format spec)

---

## Why

Organizations have data everywhere and meaning nowhere. Three systems disagree on customer count because *customer* was never defined — not in the database, but in the ontology that should sit above it.

Anchor brings that layer within reach for ordinary organizations: local-first, evidence-backed, and small enough to stay true.

---

## How it works

```
sources/          Your files (read-only, never modified)
  ↓ init          Interactive setup → .backed/config.yaml (sources + document rules)
  ↓ ingest        DuckDB snapshot — encoding, delimiters, OCR for scanned PDFs
  ↓ documents?    If PDFs/TXT/DOCX: classify → materialize → chunk → embed
  ↓ profile       SQL statistics → profile.json (no LLM)
  ↓ semantic      Column classification + ontology → proposal.json
  ↓ review        Risk-ranked questions → review.json
model.yaml        Anchor model (committable)
  ↓ serve         MCP stdio — agents query the ontology
  ↓ diff          Compare runs when sources change
```

**Ingest** reads sources in place via DuckDB. Non-UTF-8 encodings, semicolon delimiters, and European decimal commas are handled automatically; anomalies are always reported with file provenance. **ZIP/RAR** archives are extracted and scanned recursively. **PDFs** use embedded text when available, then **OCR** for scanned documents (requires [Poppler](https://poppler.freedesktop.org/) — `pdftoppm` on PATH; `brew install poppler` on macOS). Plain **TXT/MD** and **DOCX** are ingested as line-level tables.

**Profile** produces reproducible statistical evidence per column: null rates, distinct counts, patterns, candidate keys. Cross-column value overlap surfaces deterministic foreign-key candidates. No LLM participates.

**Semantic inference** runs schema-constrained LLM bursts on compressed profiles (never raw rows). Column classification and ontology use **`SEMANTIC_MODEL`** (default **`zai/glm-5.3-flash`**); ambiguous document headers use the same model. If domain vocabulary discovery fails, the pipeline **degrades gracefully** (deterministic extraction continues with minimal defaults). **Mixed folders** merge structured-table inference with deterministic document entities in one proposal.

**Review** presents risk-ranked questions for elements below **`REVIEW_CONFIDENCE_THRESHOLD`** (default `0.95`). Answers: Yes · No · Rename. Elements at or above the threshold that were not asked become **`confirmed`** in `model.yaml`; only explicit **No** answers are omitted.

**Consumption** via MCP: five deterministic operations on `model.yaml` — see [MCP surface](#mcp-surface) and [Serve and telemetry](#serve-and-telemetry).

---

## MCP surface

`backed serve` exposes the semantic model over MCP stdio. Every response is structured JSON, Zod-validated, with **no LLM** in the path.

| Operation | Input | Returns |
|---|---|---|
| `list_entities()` | — | id, name, description, status |
| `get_entity(id)` | entity id | properties (semanticType, role, provenance), entity provenance |
| `list_relations(id?)` | optional entity id | relations with cardinality and status |
| `search_model(query)` | text | semantic document-chunk search when DuckDB vectors exist, plus substring matches on entities, properties, relations, rules |
| `get_definition(term)` | term | confirmed rule (substring match), or structured not-found |

Data is read from local `model.yaml` only. DuckDB snapshots are used by `backed model`, not by `serve`.

---

## Serve and telemetry

`backed serve` runs **locally by default** — no login, no network, no gateway. MCP reads `model.yaml` (and DuckDB for semantic search when available) on this machine only.

Optional usage telemetry is **opt-in**:

1. Run `backed login` once
2. Set `BACKED_TELEMETRY=1` in `.env`
3. Run `backed serve`

When enabled, the CLI verifies the gateway at startup and posts **only the operation name** (e.g. `list_entities`) in the background on each tool call. Metering failures are silent and never block local tools. **Model data never leaves the machine.**

---

## Operational workflow

Anchor is local-first: one folder per organization or project. Configuration lives in that folder; LLM/embedding calls go only to APIs you set in `.env`.

### 1. Initialize (`backed init`)

Run once per folder (or again to change document rules):

```bash
mkdir -p sources
backed init                 
```

**Prompts:** optional document filename rules (explained in the wizard) → sources folder.

**Output:** `.backed/config.yaml`. Edit before `backed model` to fine-tune rules.

Each PDF filename becomes a **slug** (lowercase, punctuation → underscores). Rules check whether the slug **contains** your keyword.

```yaml
sourcesDir: ./sources
documentTypeHints:
  # keyword in filename slug → type id + display name (no LLM when confidence ≥ 0.85)
  - match: invoice          # matches invoice_acme_2026.pdf, acme_invoice_q1.pdf, …
    documentType: invoice       # id in model.yaml / MCP
    documentTypeLabel: Invoice  # label in review
    confidence: 0.95
  - match: inv              # second keyword, same type — add one rule per keyword
    documentType: invoice
    documentTypeLabel: Invoice
    confidence: 0.95
  - match: notice
    documentType: notice
    documentTypeLabel: Notice
    confidence: 0.9
```

Example: `public_notice_board.pdf` → slug `public_notice_board` → matches `notice`. Confidence ≥ 0.85 → deterministic (no LLM). No match → one LLM call per file. **No built-in rules at runtime** — only `config.yaml`. Empty list = LLM for every document.

### 2. Build (`backed model`)

```bash
backed model              # sources from config
backed model ./exports    # override sources (updates config)
backed model --full       # re-infer everything
```

| Stage | When | LLM? | Output |
|---|---|---|---|
| Ingest | Always | No | `.backed/data.duckdb` |
| Documents | PDF/TXT/DOCX | Ambiguous files only | `documents.json` |
| Mentions + facts | Documents | No | `document_mentions`, `document_facts`, `entity_profiles` in DuckDB |
| Chunk + embed | Documents | Embeddings only | vectors in DuckDB |
| Profile | Always | No | `profile.json` |
| Proposal | Always | Structured tables | `proposal.json` |

LLM responses are cached on disk in `.backed/cache/llm/`, keyed by model + prompt + schema. The cache only reduces cost and latency — it never changes validated outputs. Delete the folder or run `backed model --full` to re-infer from scratch.

Fact extraction is deterministic and runs during `backed model`. Upgrading `@backed/semantic` does not mutate an existing snapshot — **re-run `backed model`** on workspaces that already have document corpora when fact parsing improves.

**PDF-only folders:** `doc_*` tables get deterministic ontology (no column-classification LLM). **Mixed folders:** CSV gets LLM ontology; documents stay deterministic.

Requires `AI_GATEWAY_API_KEY` — see [Install](#install).

### 3. Review (`backed review`)

Confirms or rejects proposals → writes **`model.yaml`**.

### 4. Serve (`backed serve`)

Authenticated MCP stdio — five deterministic operations on `model.yaml` (see [MCP surface](#mcp-surface)).

### 5. Data changes

```bash
backed model && backed diff
```

### Cheat sheet

```bash
backed init && backed model && backed review && backed serve
```

Agent pattern: `list_entities` → `get_entity` → `search_model` / `get_definition`.

---

## The model

`model.yaml` contains no data. It contains the **model of the data** — portable, committable, schema-validated (`SemanticModelSchema` in `@backed/core`).

A typical organization: **4–15 entities**, **5–20 relations**, a handful of rules. Larger models usually signal inference error, not richness.

### Primitives

| Primitive | YAML key | Anchored to |
|---|---|---|
| Entity | `entities` | Source table |
| Property | `entities[].properties` | Source column |
| Relation | `relations` | Column pair (`fromColumn` → `toColumn`) |
| Rule | `rules` | Entity (+ optional column) |

Property semantic types: `text` · `number` · `amount` · `date` · `boolean` · `identifier` · `email` · `vat_number` · `fiscal_code` · `category`

Property roles: `primary_key` · `foreign_key` · `attribute`

Relation cardinality: `one_to_one` · `one_to_many` · `many_to_many`

Every element carries **`confidence`** (0–1), **`provenance`** (table, optional column, evidence sentence), and **`status`**:

| Status | Meaning |
|---|---|
| `proposed` | Inferred, not explicitly reviewed (below threshold or unanswered question) |
| `confirmed` | Accepted (Yes) or auto-confirmed when confidence ≥ review threshold and no question was asked |
| `renamed` | Accepted with corrected label (Rename) |

Rejected elements (No) are omitted. Elements at or above **`REVIEW_CONFIDENCE_THRESHOLD`** that were not asked in review are written as **`confirmed`**. Below confidence threshold 0.7, elements become doubts or review questions — never silent facts.

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
```

### Run artifacts

Each pipeline run stores intermediate artifacts under `.backed/runs/<run-id>/`:

| File | Contents |
|---|---|
| `profile.json` | Statistical evidence per table/column |
| `documents.json` | Document catalog (types, protocol, dates) when line-documents were ingested |
| `proposal.json` | LLM proposal + doubts + review questions |
| `review.json` | Human answers |
| `model.yaml` | Final model (workspace root) |
| `diff.json` | Changes vs previous run |

All files are schema-validated on read and write.

### Workspace layout

```
<workspace>/
├── sources/                 # Your data — read-only for Anchor
├── model.yaml               # Anchor model (after review)
├── .env                     # API keys (not committed)
└── .backed/
    ├── config.yaml          # sourcesDir + documentTypeHints (from backed init)
    ├── data.duckdb          # DuckDB snapshot (written by backed model)
    └── runs/<run-id>/
        ├── documents.json   # document catalog (when PDFs/TXT present)
        ├── profile.json
        ├── proposal.json
        ├── review.json
        └── diff.json
```

---

## CLI

| Command | Purpose |
|---|---|
| `backed init [folder]` | Interactive workspace setup: `sourcesDir` + `documentTypeHints` in `.backed/config.yaml` |
| `backed model [folder]` | Full pipeline: ingest → documents (if any) → profile → proposal. Incremental when `model.yaml` exists; `--full` re-infers everything. |
| `backed review` | Interactive review → writes `model.yaml` |
| `backed diff` | Compare last two runs |
| `backed login` | Sign in to Backed (optional — required only for telemetry) |
| `backed serve` | Local MCP stdio server (5 operations on `model.yaml`) |

See [Operational workflow](#operational-workflow) for the step-by-step guide.

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
# SEMANTIC_MODEL=zai/glm-5.3-flash
# SEMANTIC_EMBEDDING_MODEL=openai/text-embedding-3-small
```

See [.env.example](./.env.example).

Licensed under [Apache-2.0](./LICENSE).

---

## Development

```bash
pnpm install && pnpm build
pnpm generate:schema   # refresh schema/anchor-schema-v1.json after Zod changes
pnpm test
pnpm cli --help
```

Monorepo: `@backed/core` → `ingest` → `profile` → `semantic` → `diff` / `mcp` → `apps/cli`.

CI (GitHub Actions) runs build, schema drift check, and tests including the **Gerace golden** `model.yaml` fixture.

---

## Scope

**In (v1):** Anchor format · CLI · profiling · agentic inference · bounded review · run diff · authenticated MCP export (5 operations) · incremental re-inference · document corpus typing.

**Out (v1):** Hosted cloud · SDK · registry · billing · dashboard · writeback.

**Not Anchor:** ETL · warehouse · ERP · chatbot · connector marketplace.

**Status:** Full pipeline operational. Validating on real organization export folders.

---

<p align="center">
  <sub>Anchor v1 · Reference implementation by Backed</sub>
</p>
