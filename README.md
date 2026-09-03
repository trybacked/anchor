# Anchor

**Anchor** is an open protocol for organizational semantic models — and this repository is its reference implementation.

Point Anchor at a folder of exports (CSV, Excel, Parquet, JSON). It produces **`modello.yaml`**: a versioned map of what your data *means* — entities, relations, business definitions — with provenance and confidence on every element. Agents consume it via MCP. Humans confirm every uncertain inference through a risk-ranked review.

| | |
|---|---|
| **Anchor** | Protocol + this repo |
| **Backed** | Company — maintenance, commercial service |
| **`modello.yaml`** | Protocol artifact (the output) |
| **`backed`** | CLI command (reference implementation) |

---

## Why

Organizations have data everywhere and meaning nowhere. The ERP, three CSV exports, and a spreadsheet disagree on customer count because *customer* was never defined. AI assistants invent definitions each session because nothing anchors them to your semantics.

Anchor does not move data or replace systems. It builds the **ontology layer** above them — the same primitive enterprise platforms proved necessary, at a scale ordinary organizations can actually adopt.

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

**Ingest** reads sources in place via DuckDB. Non-UTF-8 encodings, semicolon delimiters, and European decimal commas are handled automatically; anomalies are always reported with file provenance.

**Profile** produces reproducible statistical evidence per column: null rates, distinct counts, patterns, candidate keys. No LLM participates. This evidence is the sole input to semantic inference.

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
| `backed model [folder]` | Full pipeline: ingest → profile → proposal |
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

When sources change: `backed model && backed diff`

---

## Install

**Requirements:** Node.js ≥ 22 · pnpm · [Vercel AI Gateway](https://vercel.com/ai-gateway) API key

```bash
git clone https://github.com/<org>/anchor.git
cd anchor && pnpm install && pnpm build
pnpm link --global
```

Create `.env` in your **working directory** (where you run `backed`):

```bash
AI_GATEWAY_API_KEY=...                          # required
REVIEW_CONFIDENCE_THRESHOLD=0.95                # optional — review when confidence is below this
# SEMANTIC_MODEL_CHEAP=openai/gpt-5-mini
# SEMANTIC_MODEL_FRONTIER=anthropic/claude-sonnet-4.5
```

See [.env.example](./.env.example).

---

## Development

```bash
pnpm install && pnpm build && pnpm test:unit   # 62+ tests, mock LLMs
pnpm cli --help
```

Monorepo: `@backed/core` → `ingest` → `profile` → `semantic` → `diff` / `mcp` → `apps/cli`. Details in [STRUCTURE.md](./STRUCTURE.md). Contributor guidelines in [docs/AI_GUIDELINES.md](./docs/AI_GUIDELINES.md).

---

## Scope

**In (v1):** Anchor format · CLI · profiling · agentic inference · bounded review · run diff · MCP export.

**Out (v1):** Hosted cloud · SDK · registry · billing · dashboard · writeback · incremental re-inference on diff.

**Not Anchor:** ETL · warehouse · ERP · chatbot · connector marketplace.

**Status:** Full pipeline operational on synthetic fixtures. Validating on real organization export folders.

---

<p align="center">
  <sub>Anchor v1 · Reference implementation by Backed</sub>
</p>
