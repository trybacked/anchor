# @backed/semantic

Agentic LLM bursts: `profile.json` → `proposal.json`. "Agents where they think, pipelines where they repeat."

**Responsibilities:**

- `compressProfile` — compresses the profile for the LLM: statistics, column names, patterns, aggregated top values only. Never raw rows (GDPR by design).
- LLM bursts via Vercel AI SDK (`generateText` + `Output.object`, fixed Zod schema) — column classification, ontology proposal, document header extraction — all use **`SEMANTIC_MODEL`**.
- `proposeModel` — orchestration: assembles the proposal, drops (and surfaces as doubts) any unverifiable reference, validates with `ProposalSchema`. `"I don't know"` (`doubts`) is valid output.
- `selectReviewQuestions` — one question per uncertain entity/relation/rule, sorted by **descending risk** (impact × uncertainty), each with a mini-table of evidence
- `resolveSemanticModels` — `language` + `embedding` models from env via AI Gateway (`AI_GATEWAY_API_KEY`); missing key → clear English error.

**Does not contain:** ingest, SQL, UI.
