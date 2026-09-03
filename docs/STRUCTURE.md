# Repository structure — Anchor reference implementation

> Monorepo map for the Anchor reference implementation. Product documentation: [README.md](./README.md)

## Tree

```
anchor/                      # GitHub repo name (company: Backed)
├── README.md                # Protocol + product documentation
├── STRUCTURE.md             # This file
├── apps/
│   ├── cli/                 # backed init | model | review | diff | serve
│   └── review/              # Web review UI (placeholder — terminal review in cli today)
├── packages/
│   ├── core/                # modello.yaml schemas, run artifacts (.backed/)
│   ├── ingest/              # DuckDB: CSV, Excel, Parquet, JSON
│   ├── profile/             # SQL profiling → profile.json
│   ├── semantic/            # Agentic bursts → proposal.json
│   ├── diff/                # Run comparison
│   └── mcp/                 # MCP server (ontology consumption)
├── docs/
│   └── AI_GUIDELINES.md     # Engineering guidelines for contributors
└── fixtures/                # Synthetic test data (never commit real client data)
```

Internal product design docs live outside this repository and are not published.

## Data pipeline

```
sources/ (local folder)
    ↓  @backed/ingest
DuckDB in-memory
    ↓  @backed/profile
profile.json              ← statistical evidence, zero LLM
    ↓  @backed/semantic
proposal.json             ← agentic bursts, fixed schema, confidence
    ↓  review (apps/cli)
modello.yaml              ← Anchor model (the protocol artifact)
    ↓  @backed/mcp
MCP / headless consumption
```

## Foundry mapping

| Palantir Foundry | Anchor (Phase 1) | Package |
|---|---|---|
| Data Connection | Local file ingest | `@backed/ingest` |
| Profiling | Deterministic SQL profiling | `@backed/profile` |
| Ontology inference | Agentic bursts | `@backed/semantic` |
| Ontology Manager | `modello.yaml` + review | `@backed/core`, `apps/cli` |
| Versioning | Run diff | `@backed/diff` |
| AIP (consumption) | MCP export | `@backed/mcp` |
| CLI | `backed` command | `apps/cli` |

## Workspace artifacts

Every initialized workspace (`backed init`) produces:

```
<workspace>/
├── modello.yaml              # Anchor semantic model
├── .backed/
│   ├── config.yaml
│   └── runs/<run-id>/
│       ├── profile.json
│       ├── proposal.json
│       ├── review.json
│       └── diff.json
└── sources/
```

## Package dependencies

```
@backed/core          ← no internal deps (yaml, zod)
@backed/ingest        → core
@backed/profile       → core, ingest
@backed/semantic      → core
@backed/diff          → core
@backed/mcp           → core
apps/cli              → all packages above
apps/review           → placeholder (MVP review is terminal via cli)
```

## Naming

| Name | What it is |
|---|---|
| **Anchor** | Open protocol + this repository |
| **Backed** | Company maintaining Anchor and commercial services |
| **`backed` CLI** | Reference implementation command (rename TBD) |
| **`@backed/*`** | Internal npm package scope |
