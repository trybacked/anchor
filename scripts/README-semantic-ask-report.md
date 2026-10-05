# Semantic ask — benchmark report

End-to-end agent run over **smoke cases** + **`evals/<tenant>/*.jsonl`**, with JSON + Markdown output.

## Run

Quick smoke (console only, same cases as the report):

```bash
cd anchor
pnpm build
pnpm smoke:semantic-nl
```

Full benchmark with Markdown + JSON:

```bash
pnpm report:semantic-ask
```

Requires:

- `AI_GATEWAY_API_KEY`
- `BACKED_DATABRICKS_*`
- Published ontology in workspace (default `../ontology/gerace`)

Optional:

```bash
pnpm report:semantic-ask -- \
  --workspace ../ontology/gerace \
  --md reports/my-run.md \
  --json reports/my-run.json \
  --include-optional
```

Cost estimate env (defaults approximate **gpt-4o-mini** list pricing):

- `BENCHMARK_COST_USD_PER_1M_INPUT` (default `0.15`)
- `BENCHMARK_COST_USD_PER_1M_OUTPUT` (default `0.60`)

Model: `SEMANTIC_CHAT_MODEL` / `SEMANTIC_MODEL` (same as production).

## Outputs

Default paths: `anchor/reports/semantic-ask-{tenant}-{timestamp}.md` and `.json`.

Markdown includes executive summary, latency percentiles, tokens/cost, category breakdown, per-question table, error taxonomy, failure detail, full question catalog.

Exit code **1** if any non-optional case throws or fails assertions (report is still written).

## Extend question set

Add lines to `anchor/evals/<tenant>/*.jsonl`:

```json
{
  "id": "my-case",
  "category": "workshop-it",
  "question": "…",
  "expect": { "toolsInclude": ["query_objects"], "mode": "count" }
}
```

Smoke suite: `scripts/semantic-nl-smoke.cases.json`.
