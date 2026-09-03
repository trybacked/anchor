# @backed/core

Il sole del sistema: schema `modello.yaml`, tipi per run/diff/review, path `.backed/`.

**Responsabilità:**

- Zod schema for `modello.yaml` (`SemanticModelSchema`, documented in root README)
- Zod schema per gli artefatti di run: `ProfileReportSchema`, `ProposalSchema`, `ReviewSchema`, `ModelDiffSchema`
- `applyReview(proposal, review)` — applicazione deterministica delle risposte umane → `SemanticModel`
- Layout workspace: `workspacePaths`, `createRunId`, lettura/scrittura validata di config e artefatti (`.backed/`, `.backed/runs/<id>/`), serializzazione YAML di `modello.yaml`
- Costanti condivise: `LOW_CONFIDENCE_THRESHOLD`, `DEFAULT_REVIEW_CONFIDENCE_THRESHOLD`, `MODEL_FORMAT_VERSION`

**API pubblica principale:** schemi + tipi inferiti, `applyReview`, `initWorkspace` / `readWorkspaceConfig`, `writeRunArtifact` / `readRunArtifact` / `listRunIds`, `writeModelYaml` / `readModelYaml` / `serializeModelYaml` / `parseModelYaml`.

**Non contiene:** logica ingest, SQL, LLM, UI.
