# @backed/diff

Deterministic run comparison — zero LLM in the MVP.

**Responsibilities:**

- `diffRuns(previous, next)` — compares two `RunSnapshot`s (profile + optional `model.yaml`): table/column added or removed, type changed, entity removed, relation added/removed/**broken** (join columns no longer exist in the new profile). Output validated with `ModelDiffSchema` (`diff.json`).
- `formatDiff(diff)` — human-readable English report for the CLI.

**Does not contain:** ingest, LLM, UI.
