# Backed — Fase 1

CLI local-first per estrarre e mantenere il modello semantico di un'organizzazione (`modello.yaml`).

```bash
pnpm install
pnpm build
pnpm cli --help
```

## Comandi (MVP funzionante)

| Comando | Cosa fa | Package principale |
|---|---|---|
| `backed init [cartella]` | Inizializza `.backed/config.yaml` | `@backed/cli` + `@backed/core` |
| `backed model [--no-llm]` | Profilo + proposta ontologia LLM | `ingest` → `profile` → `semantic` |
| `backed review` | Max 10 domande per rischio → `modello.yaml` | `@backed/cli` (terminale, MVP) |
| `backed diff` | Confronto tra le ultime due run | `@backed/diff` |
| `backed serve` | MCP server stdio sull'ontologia | `@backed/mcp` |

Per l'AI serve `AI_GATEWAY_API_KEY` in un file `.env` (vedi `.env.example`); con `--no-llm` la pipeline si ferma al profilo.

Vedi [STRUCTURE.md](./STRUCTURE.md) per la mappa completa e [docs/AI_GUIDELINES.md](./docs/AI_GUIDELINES.md) per le regole di sviluppo.

## Documentazione di design

I doc di prodotto vivono in `design/` (copiati o linkati da `Desktop/Projects/backed/design/`).

## Perimetro Fase 1

**Sì:** formato `modello.yaml`, CLI, profilazione deterministica, burst agentici, review, diff, MCP export.

**No:** SDK, hosted cloud, registry, billing, viewer/dashboard, writeback operativo.
