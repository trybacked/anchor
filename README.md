# Backed — Fase 1

CLI local-first per estrarre e mantenere il modello semantico di un'organizzazione (`modello.yaml`).

```bash
pnpm install
pnpm build
pnpm cli --help
```

## Comandi target (Fase 1)

| Comando | Settimana | Package principale |
|---|---|---|
| `backed init` | 3 | `@backed/cli` + `@backed/core` |
| `backed model` | 3–6 | `ingest` → `profile` → `semantic` |
| `backed review` | 5–6 | `@backed/review` |
| `backed diff` | 7–8 | `@backed/diff` |
| `backed serve` | 7–8 | `@backed/mcp` |

Vedi [STRUCTURE.md](./STRUCTURE.md) per la mappa completa e [docs/AI_GUIDELINES.md](./docs/AI_GUIDELINES.md) per le regole di sviluppo.

## Documentazione di design

I doc di prodotto vivono in `design/` (copiati o linkati da `Desktop/Projects/backed/design/`).

## Perimetro Fase 1

**Sì:** formato `modello.yaml`, CLI, profilazione deterministica, burst agentici, review, diff, MCP export.

**No:** SDK, hosted cloud, registry, billing, viewer/dashboard, writeback operativo.
