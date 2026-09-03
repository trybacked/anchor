# @backed/semantic

Burst agentici LLM: `profile.json` → `proposal.json`. "Agents where they think, pipelines where they repeat."

**Responsabilità:**

- `compressProfile` — comprime il profilo per l'LLM: solo statistiche, nomi colonne, pattern, top values aggregati. Mai righe grezze (GDPR per costruzione).
- Due burst con Vercel AI SDK (`generateText` + `Output.object`, schema Zod fisso):
  1. classificazione colonne → **modello economico** (`SEMANTIC_MODEL_CHEAP`);
  2. entità/relazioni/definizioni ambigue → **modello frontier** (`SEMANTIC_MODEL_FRONTIER`).
- `proposeModel` — orchestrazione: assembla la proposta, scarta (e segnala come dubbio) ogni riferimento non verificabile, valida con `ProposalSchema`. "Non lo so" (`doubts`) è output valido.
- `selectReviewQuestions` — one question per uncertain entity/relation/rule, sorted by **descending risk** (impact × uncertainty), each with a mini-table of evidence
- `resolveSemanticModels` — model routing from env via AI Gateway (`AI_GATEWAY_API_KEY`); missing key → clear English error.

**Test:** unit con `MockLanguageModelV3` (`pnpm test:unit`, zero rete); LLM reale in `pnpm test:integration` (richiede `AI_GATEWAY_API_KEY`).

**Non contiene:** ingest, SQL, UI.
