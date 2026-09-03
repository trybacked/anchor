# @backed/diff

Confronto deterministico tra run — zero LLM nell'MVP.

**Responsabilità:**

- `diffRuns(previous, next)` — confronta due `RunSnapshot` (profilo + modello opzionale): tabella/colonna nuova o sparita, tipo cambiato, entità sparita, relazione nuova/sparita/**rotta** (le colonne di aggancio non esistono più nel nuovo profilo). Output validato con `ModelDiffSchema` (`diff.json`).
- `formatDiff(diff)` — human-readable English report for the CLI.

**Non contiene:** ingest, LLM, UI.
