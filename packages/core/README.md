# @backed/core

The center of the system: `model.yaml` schema, run/diff/review types, `.backed/` paths.

**Responsibilities:**

- Zod schema for `model.yaml` (`SemanticModelSchema`) — exported as [`schema/anchor-schema-v1.json`](../../schema/anchor-schema-v1.json); spec in [`docs/MODEL-FORMAT-v1.md`](../../docs/MODEL-FORMAT-v1.md)
- `pnpm generate:schema` — regenerate JSON Schema from Zod after protocol changes
- Zod schemas for run artifacts: `ProfileReportSchema`, `ProposalSchema`, `ReviewSchema`, `ModelDiffSchema`
- `applyReview(proposal, review)` — deterministic application of human answers → `{ model, staleAnswerCount }`; auto-confirms elements at or above `REVIEW_CONFIDENCE_THRESHOLD` that were not asked
- Workspace layout: `workspacePaths`, `createRunId`, validated read/write of config and artifacts (`.backed/`, `.backed/runs/<id>/`), YAML serialization of `model.yaml`
- Shared constants: `LOW_CONFIDENCE_THRESHOLD`, `DEFAULT_REVIEW_CONFIDENCE_THRESHOLD`, `MODEL_FORMAT_VERSION`

**Main public API:** schemas + inferred types, `applyReview`, `initWorkspace` / `readWorkspaceConfig`, `writeRunArtifact` / `readRunArtifact` / `listRunIds`, `writeModelYaml` / `readModelYaml` / `serializeModelYaml` / `parseModelYaml`.

**Does not contain:** ingest logic, SQL, LLM, UI.
