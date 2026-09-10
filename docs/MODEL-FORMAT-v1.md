# Anchor model format v1

Normative specification for **`model.yaml`** — the committable semantic model produced by Anchor.

**Machine-readable schema:** [`schema/anchor-schema-v1.json`](../schema/anchor-schema-v1.json) (generated from Zod in `@backed/core`).

**Format version:** `metadata.formatVersion` must be `"1"`.

---

## Purpose

`model.yaml` contains no row data. It describes **entities**, **properties**, **relations**, and **rules** inferred from organizational sources, with provenance and review status on every element.

Implementations in any language should validate against `anchor-schema-v1.json`.

---

## Top-level structure

```yaml
metadata:
  formatVersion: "1"
  runId: <run-id>
  generatedAt: <ISO-8601 datetime>
  sourceDir: <optional path>

entities: []
relations: []
rules: []
```

Writeback **actions** are reserved for a future format version and are **not** part of v1.

---

## Primitives

| Primitive | Key | Anchored to |
|---|---|---|
| Entity | `entities[]` | Source table (`sourceTable`) |
| Property | `entities[].properties[]` | Source column (`columnName`) |
| Relation | `relations[]` | Column pair (`fromColumn` → `toColumn`) |
| Rule | `rules[]` | Entity (`appliesTo`) and optional column |

### Property semantic types

`text` · `number` · `amount` · `date` · `boolean` · `identifier` · `email` · `vat_number` · `fiscal_code` · `category`

### Property roles

`primary_key` · `foreign_key` · `attribute`

### Relation cardinality

`one_to_one` · `one_to_many` · `many_to_many`

---

## Confidence, provenance, status

Every entity, property, relation, and rule carries:

- **`confidence`** — number in `[0, 1]`
- **`provenance`** — `{ table, column?, evidence }` where `evidence` is a human-readable sentence
- **`status`** — review state (see below)

Elements below confidence 0.7 become doubts or review questions during inference — never silent facts.

---

## Review semantics

After human review (`backed review`), elements have one of these statuses:

| Status | Meaning |
|---|---|
| `proposed` | Inferred but not explicitly reviewed (below threshold or unanswered question) |
| `confirmed` | Accepted in review (Yes), **or** auto-confirmed when confidence ≥ review threshold and no question was asked |
| `renamed` | Accepted with corrected label (Rename) |

Rejected elements (No) are **omitted** from `model.yaml`.

**MCP consumers:** treat `confirmed` and `renamed` as queryable truth. `get_definition` returns only **`confirmed`** rules.

---

## MCP query behavior (v1)

Five deterministic operations on a validated model — no LLM in the query path.

| Tool | Lookup strategy |
|---|---|
| `list_entities` | Full entity list |
| `get_entity` | By entity `id` |
| `list_relations` | All relations, or filter by entity `id` |
| `search_model` | **Hybrid:** semantic search over ingested document-chunk embeddings when DuckDB vectors exist, merged with case-insensitive substring match on entities, properties, relations, and rules. Falls back to substring-only when embeddings are unavailable. |
| `get_definition` | **Substring scoring only** on confirmed rules: exact id → exact name → partial name → partial definition. Rules are short structured records; semantic chunk search is not applied here in v1. |

---

## Validation

```bash
# TypeScript / Node
pnpm build
node -e "import { readFileSync } from 'fs'; import { parseModelYaml } from './packages/core/dist/model-yaml.js'; parseModelYaml(readFileSync('model.yaml','utf8'));"
```

Any JSON Schema validator can validate the parsed YAML object against `schema/anchor-schema-v1.json`.

---

## Golden fixture

The Gerace municipal corpus golden model lives at:

`packages/core/tests/golden/gerace/model.yaml`

with structural expectations in `manifest.json`. CI runs `golden/gerace.test.ts` to guard extraction regressions.

---

## Hosted ephemeral pipeline

When served through `apps/worker-service`, each tenant gets an isolated workspace:

```
tenants/<tenantId>/
├── work/      ← ephemeral — all uploaded bytes and pipeline scratch data
└── persist/   ← durable — semantic artifacts only (see below)
```

**`persist/` contains only these five files:**

| File | Purpose |
|---|---|
| `model.yaml` | Committable semantic model |
| `ledger.json` | SHA-256 content hashes (incremental skip) |
| `deletion-log.jsonl` | Append-only GC proof per run |
| `proposal.json` | Latest inference proposal (review input) |
| `review.json` | Human review answers |

Documents, raw corpus, DuckDB snapshots, embeddings, and run scratch data **never** persist. They live under `work/` during processing and are deleted when the run finishes (success or failure).

Re-submitting unchanged files costs nothing: content hashes in `ledger.json` skip them.

Every run's deletion is recorded in `deletion-log.jsonl` with `{ runId, tenantId, deletedAt, filesDeleted, bytesDeleted }` — auditable via the worker-service audit API.
