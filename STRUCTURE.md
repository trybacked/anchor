# Struttura del monorepo — Fase 1

> Mappa Foundry → Backed. Questo doc descrive **dove va cosa**, non l'implementazione.
> Prossimo step: decidere file-per-file dentro ogni package.

## Albero

```
backed/
├── apps/
│   ├── cli/                 # Entry point: backed init | model | review | diff | serve
│   └── review/              # UI review (10 domande, Sì/No/Rinomina)
├── packages/
│   ├── core/                # modello.yaml, tipi condivisi, artefatti run (.backed/)
│   ├── ingest/              # DuckDB: CSV/Excel/Parquet/JSON/Postgres/S3
│   ├── profile/             # Profilazione SQL pura → profile.json
│   ├── semantic/            # Burst agentici LLM → proposta ontologia
│   ├── diff/                # Confronto tra run, re-run incrementale
│   └── mcp/                 # MCP server locale (consumo ontologia)
├── design/                  # Doc di prodotto (04-model-format.md = priorità)
├── docs/
│   └── AI_GUIDELINES.md     # Regole per agenti AI che scrivono codice
└── fixtures/                # Cartelle di test (anonimizzate, mai committare dati reali)
```

Il piano operativo Fase 1 è in [design/03-plan-fase-uno.md](./design/03-plan-fase-uno.md).

## Pipeline dati

```
Sorgenti (cartella locale)
    ↓  @backed/ingest
DuckDB in-memory / attach readonly
    ↓  @backed/profile
profile.json          ← evidenza statistica, zero LLM
    ↓  @backed/semantic
proposta ontologia    ← burst agentici, schema fisso, confidenza
    ↓  review (apps/review)
modello.yaml          ← IL PRODOTTO
    ↓  @backed/mcp
MCP / query headless
```

## Mappa Foundry → Package

| Foundry | Backed Fase 1 | Package / App | Settimana |
|---|---|---|---|
| Data Connection | Ingest tre porte | `@backed/ingest` | 3–4 |
| Profiling / quality | Profilazione deterministica | `@backed/profile` | 3–4 |
| Ontology inference | Burst agentici | `@backed/semantic` | 5–6 |
| Ontology Manager | modello.yaml + review | `@backed/core` + `apps/review` | 5–6 |
| Versioning | Diff git-like | `@backed/diff` | 7–8 |
| AIP | MCP export | `@backed/mcp` | 7–8 |
| CLI / local-first | `npx backed` | `apps/cli` | 3–8 |

## Artefatti locali (`.backed/`)

Ogni progetto inizializzato con `backed init` produce:

```
<workspace>/
├── modello.yaml              # ontologia confermata
├── .backed/
│   ├── config.yaml           # sorgenti, run id corrente
│   ├── runs/<run-id>/
│   │   ├── profile.json
│   │   ├── proposal.json     # output semantic (pre-review)
│   │   ├── review.json       # risposte umane
│   │   └── diff.json         # vs run precedente
│   └── duckdb/               # cache ingest (opzionale)
└── sorgenti/                 # cartella dati del cliente
```

## Riuso dal Backed precedente

Il repo `Desktop/Projects/backed` contiene codice riusabile. **Non riscrivere, adattare.**

| Esistente | Riutilizzo in Fase 1 | Nuovo package |
|---|---|---|
| `@backed/parsers` + `@backed/graph` | Adapters ingest → IR | `@backed/ingest` |
| `@backed/semantic` | Burst agentici (da adattare) | `@backed/semantic` |
| `@backed/generators` + `@backed/mcp` | MCP export | `@backed/mcp` |
| `@backed/capability-ir` | Base per `modello.yaml` | `@backed/core` |
| `apps/web` | Review UI | `apps/review` |
| diff engine (compiler/pipeline) | Run diff | `@backed/diff` |

## Dipendenze tra package (target)

```
@backed/core          ← nessuna dipendenza interna
@backed/ingest        → core
@backed/profile       → core, ingest
@backed/semantic      → core, profile
@backed/diff          → core
@backed/mcp           → core
apps/cli              → tutti i package sopra
apps/review           → core, semantic
```

## Prossimo step (da decidere insieme)

Per ogni package, definire:

1. **Interfacce pubbliche** (`index.ts` exports)
2. **File interni** (`src/` layout)
3. **Schemi Zod** vs tipi TS puri
4. **Cosa migrare** dal repo precedente vs scrivere da zero
5. **Test fixture** minime in `fixtures/`

Priorità implementazione: `core` → `ingest` → `profile` → `cli model` → resto.
