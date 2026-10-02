# Semantic NL smoke

End-to-end check: **natural language question → Vercel AI Gateway → routed plan (`single` | `template`) → validate → Databricks** (templates: document search then contract filter).

## Run

### LLM baseline gate (≥90% plan correctness)

```bash
pnpm build
pnpm smoke:semantic-nl-baseline
# CI gate: exits 1 if required-case plan pass rate < 90%
pnpm smoke:semantic-nl-baseline -- --json /tmp/nl-baseline.json --min-plan-rate 0.9
```

Reports **plan** vs **E2E** pass rates on `semantic-nl-smoke.cases.json` (required cases only for the gate). Optional cases are advisory.

### Benchmark (50 questions)

```bash
pnpm build
pnpm smoke:semantic-nl-benchmark
# optional: --count 30 --json /tmp/semantic-benchmark.json
# optional cost estimate: BENCHMARK_COST_USD_PER_1M_INPUT / _OUTPUT
```

Reports mean/p50/p95 latency, token totals, LLM call count (includes repair retries), and success rate. Not a strict CI gate.

## Run (CI smoke)

```bash
cd anchor
pnpm build
pnpm smoke:semantic-nl
# optional:
pnpm smoke:semantic-nl -- --workspace ../ontology/gerace
```

## Env

| Variable                                  | Required                          |
| ----------------------------------------- | --------------------------------- |
| `AI_GATEWAY_API_KEY`                      | yes                               |
| `SEMANTIC_CHAT_MODEL` or `SEMANTIC_MODEL` | no (default `openai/gpt-4o-mini`) |
| `BACKED_DATABRICKS_*`                     | yes (tenant, e.g. gerace)         |

Loads `anchor/.env`, workspace `.env`, and `~/.config/backed/<tenant>.env`.

## Cases

Defined in [`semantic-nl-smoke.cases.json`](semantic-nl-smoke.cases.json).

**Baseline (6)** — count, sample rows, multi-hop, contains, optional negative probe.

**Complex mono-query (4)** — `in` on multiple ingest months, `GROUP BY` + aggregation by region, join + `select` for organization name, long multi-constraint count.

Each case checks:

- **Plan shape** — `objectId`, `mode`, required filters/joins
- **Execution** — row/count bounds, provenance length, compiled SQL
- **Repair budget** — `attempts ≤ maxAttempts`
- **Negative** — CRM-style questions must fail validation

Exit code **1** if any **required** case fails. Cases with `"optional": true` (e.g. negative / hallucination probes) log **WARN** but do not fail the run — use them to watch model behaviour, not as hard gates.

## Extending

Add entries to `cases.json`. Useful `expect` fields:

- `filtersInclude`, `filtersIncludeMonths`, `joinsInclude`
- `groupByIncludes`, `aggregationsMin`, `selectIncludesAny`, `sqlIncludes`
- `countEquals`, `countMin`, `maxRowCount`
- `shouldFail` + `failType` for negative tests
- `route`, `templateId` for plan-template cases (optional until `docs.*` is loaded)
