# @backed/cli

CLI local-first. Orchestrazione dei comandi, zero logica di dominio. Copy utente in italiano.

## Comandi

| Comando | Cosa fa |
|---|---|
| `backed init [cartella]` | Crea `.backed/config.yaml` con la cartella sorgenti (default `./sorgenti`) |
| `backed model [cartella] [--no-llm]` | Ingest → profile → `profile.json`, poi burst semantici → `proposal.json`. Con `--no-llm` si ferma al profilo (nessuna chiave richiesta) |
| `backed review` | Review da terminale: max 10 domande per rischio con evidenza, risposte Sì/No/Rinomina, contatore "4 di 10" → `review.json` + `modello.yaml` |
| `backed diff` | Confronta le ultime due run → `diff.json` + report in italiano |
| `backed serve` | MCP server stdio su `modello.yaml` (tools: `list_entities`, `get_entity`, `list_relations`, `search_model`) |

## Esempio d'uso

```bash
cd cartella-del-cliente
backed init ./sorgenti
backed model            # richiede AI_GATEWAY_API_KEY in .env (oppure --no-llm)
backed review           # conferma/correggi → scrive modello.yaml
backed serve            # gli agenti AI consultano l'ontologia via MCP
backed model && backed diff   # re-run quando i dati cambiano
```

Variabili d'ambiente (via `.env`, mai committato — vedi `.env.example`): `AI_GATEWAY_API_KEY` (obbligatoria per l'AI), `SEMANTIC_MODEL_CHEAP`, `SEMANTIC_MODEL_FRONTIER` (opzionali).

Errori sempre spiegati in italiano, exit code 1 sui fallimenti.
