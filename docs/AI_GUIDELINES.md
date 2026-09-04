# AI Guidelines — Backed Fase 1

> Regole per agenti AI (Cursor, Claude Code, ecc.) che scrivono codice in questo repo.
> Leggere **prima** di toccare qualsiasi file.

---

## 1. Missione

Costruire la CLI local-first che estrae e mantiene il **modello semantico** di un'organizzazione PMI italiana.

Il prodotto è `modello.yaml`, non la CLI. La CLI è il mezzo.

**Metriche di vita o morte:**
- Domande umane per cartella: **<10** e in discesa
- Costo-token / prezzo: **<30%**
- Studi che propongono il tool ai clienti senza che tu lo chieda: **≥1**

---

## 2. Perimetro Fase 1 (hard boundary)

### Sì
- Spec `modello.yaml` (root [README.md](../README.md))
- CLI: `init` → `model` → `review` → `diff` → `serve`
- Ingest DuckDB + profilazione SQL pura
- Burst agentici LLM (profili compressi, mai dati grezzi)
- Review UI (10 domande per rischio)
- Diff tra run + MCP export locale

### No — rifiutare senza discussione
- SDK, hosted cloud, registry, portale studi
- Billing, viewer/dashboard
- Writeback operativo (solo campo nel formato)
- Integrazioni gestoriali dedicate
- Feature richieste da nessuno

**Regola di ammissione:** *"Questa feature nel mondo Foundry a quale riga corrisponde?"*
Se è una feature-app che Palantir lascia ai clienti → la costruisce il cliente, non noi.

---

## 3. Architettura

### Principio guida
**Agents where they think, pipelines where they repeat.**

- Deterministico (SQL, parsing, diff strutturale) → pipeline
- Ambiguità semantica, naming, definizioni business → burst agentici
- Mai LLM dove SQL basta

### Package boundaries

| Package | Fa | Non fa |
|---|---|---|
| `@backed/core` | Schema, tipi, path `.backed/` | I/O, SQL, LLM |
| `@backed/ingest` | DuckDB, lettura sorgenti | Profilazione, LLM |
| `@backed/profile` | SQL → `profile.json` | Inferenza semantica |
| `@backed/semantic` | LLM → `proposal.json` | Ingest, UI |
| `@backed/diff` | Confronto run | Ingest, LLM completo |
| `@backed/mcp` | Server MCP | Pipeline |
| `apps/cli` | Orchestrazione comandi | Logica di dominio |
| `apps/review` | UI review | Pipeline |

**Violazione:** importare `@backed/semantic` da `@backed/ingest`. Le dipendenze seguono la pipeline, mai al contrario.

### Riuso dal repo precedente

Repo: `Desktop/Projects/backed`. **Non riscrivere, adattare.**

Prima di scrivere codice nuovo, verificare se esiste già in:
- `@backed/parsers`, `@backed/graph` → ingest adapters
- `@backed/capability-ir` → base schema `modello.yaml`
- `@backed/semantic` → burst agentici
- `@backed/generators`, `@backed/mcp` → MCP export
- `apps/web` → review UI
- compiler/pipeline → diff engine

---

## 4. Clean code (obbligatorio)

### Naming
- Nomi che rivelano intento: `detectDecimalComma`, non `checkSep`
- Glossary terms (internal): Source, Dataset, Entity, Property, Relation, Rule, Run, Diff, Review, Confidence, Provenance
- Event handlers: prefisso `handle` (`handleReviewSubmit`)

### Struttura
- **Single responsibility:** una funzione, una cosa
- **Early returns:** evitare nesting profondo
- **Constants over magic numbers:** thresholds (e.g. `LOW_CONFIDENCE_THRESHOLD`) in `@backed/core`
- **DRY:** logica condivisa in `@backed/core`, non duplicata tra package
- **Imports in cima al file** — no inline imports

### TypeScript
- `strict: true`, sempre
- Switch su union: `default: { const _exhaustive: never = x; }` per exhaustive check
- `type` imports separati: `import type { X } from "..."`
- Zod per validazione runtime di artefatti (profile.json, modello.yaml)
- Tipi TS per API interne tra package

### Commenti
- Il codice si spiega da solo
- Commenti solo per **perché**, non per **cosa**
- TODO solo per bug noti o debito documentato

### Errori
- **Mai fallire in silenzio** — specialmente ingest (encoding, separatori, header)
- Segnalare anomalie con provenienza (file, riga, colonna)
- `"non lo so"` è output valido per semantic, non un errore

---

## 5. Regole operative per l'AI

### Scope
- Cambiare **solo** ciò che serve al task corrente
- Diff minimi — ogni riga è debito potenziale
- Non refactorare codice non toccato dal task
- Non aggiungere dipendenze senza motivo concreto
- Non inventare feature o file non richiesti

### Ordine di implementazione
1. Root [README.md](../README.md) — Anchor protocol and format
2. `@backed/core` (schema + tipi)
3. `@backed/ingest` + `@backed/profile`
4. `backed model` (pipeline deterministica, zero LLM)
5. `@backed/semantic` + review
6. `@backed/diff` + `@backed/mcp`

### Test
- Validazione manuale su workspace cliente locale (cartella `sources/`, mai committata)
- Non testare l'ovvio; testare i casi patologici italiani quando si aggiungono test mirati

### Dati
- **Mai committare dati reali di clienti**
- Profili LLM: dati compressi/statistici, mai righe grezze
- `.backed/` in `.gitignore` del workspace cliente, non del repo

### Language
- User-facing copy (CLI output, review UI): **English**
- Code (names, technical comments): **English**
- Product design docs are internal to Backed (not in this repo)

---

## 6. Convenzioni repo

### Monorepo
- Package manager: **pnpm** workspaces
- Build: **turbo**
- Node: **≥22**, ESM (`"type": "module"`)
- Scope npm: `@backed/*`

### File layout per package
```
packages/<name>/
├── src/
│   ├── index.ts          # public API
│   └── ...               # moduli interni
├── package.json
├── tsconfig.json
└── README.md             # responsabilità + confini
```

### Commit
- Messaggi chiari, focused
- Un concetto per commit
- Non committare `.env`, dati reali, `node_modules/`

---

## 7. Anti-pattern (vietati)

| Anti-pattern | Perché |
|---|---|
| LLM per profilazione statistica | SQL è gratis e deterministico |
| Dati grezzi nel prompt LLM | GDPR + costo + allucinazioni |
| Feature "perché Palantir ce l'ha" | Perimetro Fase 1 |
| Rebuild da zero del repo precedente | "Niente rebuild per pulizia" |
| UI/dashboard in Fase 1 | Headless: MCP + API |
| Fail silently su CSV italiano | Il mercato è win-1252 e `;` |
| Inventare relazioni senza confidenza | Ogni output ha confidenza + provenienza |
| Più di 10 domande review | Metrica <10 domande/cartella |

---

## 8. Checklist pre-merge

Prima di considerare un task completato:

- [ ] Rispetta i confini package (sezione 3)
- [ ] Nessuna feature fuori perimetro (sezione 2)
- [ ] Casi patologici italiani gestiti o segnalati (ingest)
- [ ] Output ha schema fisso + validazione Zod (core)
- [ ] Confidenza e provenienza su ogni inferenza (semantic)
- [ ] Test su fixture, almeno unit per logica deterministica
- [ ] `pnpm typecheck` passa
- [ ] Diff minimale, nessun file non correlato toccato

---

## 9. Riferimenti

- [README.md](../README.md) — Anchor protocol and format
- [STRUCTURE.md](../STRUCTURE.md) — monorepo layout
- Repo precedente: `Desktop/Projects/backed`
