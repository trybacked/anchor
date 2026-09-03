# @backed/core

Il sole del sistema: schema `modello.yaml`, tipi per run/diff/review, path `.backed/`.

**Responsabilità:**
- Zod schema per `modello.yaml` (da `design/04-model-format.md`)
- Tipi per `profile.json`, `proposal.json`, `review.json`, `diff.json`
- Utility path: `.backed/runs/<id>/`
- Costanti (max 10 domande review, soglie confidenza)

**Non contiene:** logica ingest, SQL, LLM, UI.
