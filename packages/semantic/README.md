# @backed/semantic

Burst agentici LLM: `profile.json` → `proposal.json`. "Agents where they think, pipelines where they repeat."

**Responsabilità:**

- `compressProfile` — comprime il profilo per l'LLM: solo statistiche, nomi colonne, pattern, top values aggregati. Mai righe grezze (GDPR per costruzione).
- Due burst con Vercel AI SDK (`generateText` + `Output.object`, schema Zod fisso):
  1. classificazione colonne → **modello economico** (`SEMANTIC_MODEL_CHEAP`);
  2. entità/relazioni/definizioni ambigue → **modello frontier** (`SEMANTIC_MODEL_FRONTIER`).
- `proposeModel` — orchestrazione: assembla la proposta, scarta (e segnala come dubbio) ogni riferimento non verificabile, valida con `ProposalSchema`. "Non lo so" (`doubts`) è output valido.
- `selectReviewQuestions` — max 10 domande per **rischio decrescente** (impatto × incertezza), ognuna con mini-tabella di evidenza.
- `resolveSemanticModels` — routing modelli da env via AI Gateway (`AI_GATEWAY_API_KEY`); chiave mancante → errore chiaro in italiano.

**Test:** unit con `MockLanguageModelV3` (`pnpm test:unit`, zero rete); LLM reale in `pnpm test:integration` (richiede `AI_GATEWAY_API_KEY`).

**Non contiene:** ingest, SQL, UI.
