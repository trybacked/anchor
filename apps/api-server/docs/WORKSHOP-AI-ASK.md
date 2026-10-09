# Workshop — Domande in linguaggio naturale sui dati (AI ask)

Guida per **facilitatori e partecipanti**. Il backend espone un unico flusso: fai una domanda in italiano (o inglese) e ottieni una risposta **basata su query governate** sull’ontologia e sul warehouse (documenti indicizzati, totali, elenchi, ricerca testuale sull’archivio).

Non serve un prodotto “Chiedi” dedicato: basta **login sul gateway** e le API sotto `/t/{tenant}/v1/chat/ask`.

Riferimento tecnico breve: [AI-ASK.md](./AI-ASK.md).

---

## Obiettivo del workshop

Esplorare cosa si può chiedere all’AI quando i dati sono **modellati** (entità, proprietà, glossario) e **interrogati con gli stessi tool** usati da MCP/API:

- quanti documenti sono indicizzati;
- elenchi per nome file o tipo;
- ricerca nel testo dei PDF (archivio);
- chiarimenti quando la domanda è ambigua.

---

## Cosa c’è in produzione (modello semplice)

| Pezzo                          | Ruolo                                  |
| ------------------------------ | -------------------------------------- |
| **Gateway** (`api.backed.app`) | Login WorkOS, proxy verso platform-api |
| **Platform-api** (privato)     | Esegue l’agente + query sul files engine |
| **`GET …/v1/chat/ask/status`** | Dice se l’ask è attivo per il tenant   |
| **`POST …/v1/chat/ask`**       | Body `{ "question": "…" }` → risposta  |

L’LLM passa da **Vercel AI Gateway** (`AI_GATEWAY_API_KEY` solo su platform-api).  
Nessun flag “abilita semantic chat” per tenant: è **on** salvo disabilitazione esplicita lato registry.

---

## Prima di iniziare (checklist facilitatore)

1. Tenant con ontologia **pubblicata** (es. `acme`).
2. Dati warehouse raggiungibili (stesso test di una query oggetti normale).
3. `GET /t/{tenant}/v1/chat/ask/status` → **`available: true`**.
4. Partecipanti con accesso al gateway (sessione WorkOS o app che proxya le stesse route).

Se `available: false`:

- `missing_llm_gateway` → chiave LLM su **platform-api** + redeploy.
- `disabled_for_tenant` → tenant disabilitato (`capabilities.aiAsk: false`).

---

## Come provare (partecipanti)

### Opzione A — Documentazione interattiva (consigliata)

1. Vai su `https://api.backed.app` e accedi.
2. Apri **Docs** → tenant del workshop (es. `/docs/t/acme`).
3. Esegui **`GET /v1/chat/ask/status`**.
4. Esegui **`POST /v1/chat/ask`** con body JSON:

```json
{
  "question": "Quanti documenti sono nell'archivio del tenant?"
}
```

### Opzione B — curl (con cookie di sessione)

Sostituisci `{tenant}` e usa il cookie di sessione del browser dopo login:

```bash
curl -sS 'https://api.backed.app/t/{tenant}/v1/chat/ask/status'

curl -sS 'https://api.backed.app/t/{tenant}/v1/chat/ask' \
  -H 'Content-Type: application/json' \
  -d '{"question":"Elenca 5 documenti con il nome del file"}'
```

### Opzione C — SDK (chi scrive script)

```ts
const ok = await tenant.ai.status();
if (ok.available) {
  const r = await tenant.ai.ask({
    question: "Quanti documenti indicizzati ci sono?",
  });
  console.log(r.answer, r.agentSteps);
}
```

---

## Esempi di domande (documenti e modello)

Usa formulazioni **chiare su file, persone e contenuto**.

**Conteggi e elenchi**

- Quanti documenti sono indicizzati?
- Mostrami 5 documenti con filename e cartella.

**Contenuto (archivio)**

- Cosa dice il CV di … sui progetti?
- Nel documento sul consumo zero, quali obiettivi sono citati?

**Ambiguità (comportamento atteso)**

- Domande su tipi di oggetto ambigui senza contesto → l’agente può chiedere chiarimento o usare `search_documents` sull’archivio.

---

## Cosa restituisce la risposta

Campi utili per demo o per una UI minimale:

| Campo                     | Uso                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **`answer`** / **`text`** | Testo per l’utente                                                                                                       |
| **`clarification`**       | `{ question, options[] }` — mostrare bottoni/scelte                                                                      |
| **`agentSteps`**          | Traccia tool/SQL; ogni step ha **`status`** (`ok` / `error`) e, se errore, **`error`** (messaggio warehouse/validazione) |
| **`claims`**              | Numeri citati con `toolCallId` (grounding)                                                                               |
| **`runId`**               | Annotare feedback o segnalazioni                                                                                         |
| **`usage`**               | Latenza / token (opzionale in demo)                                                                                      |

Il campo **`route`** è sempre **`agent`** (niente vecchio flusso “piano/template”).

---

## Errori in sala

| HTTP    | Cosa dire                                                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **503** | Ask non disponibile — rifare status; problema deploy/chiave LLM                                                                   |
| **422** | Domanda o esecuzione non completata (validazione, grounding, budget step) — riprovare domanda più precisa o guardare `agentSteps` |
| **401** | Non loggati sul gateway                                                                                                           |

---

## Idee per esercizi (45–90 min)

1. **Status + prima domanda** — conteggio documenti indicizzati.
2. **Elenchi** — top-N file per cartella o tipo.
3. **Ricerca testo** — domanda su contenuto PDF; verificare citazioni in `agentSteps`.
4. **Trasparenza** — aprire `agentSteps` e discutere SQL/filtri.
5. **Stretch** — domanda vaga e gestione `clarification`.

---

## Cosa _non_ è scope del workshop backend

- Modifica ontologia in tempo reale (authoring → publish separato).
- Upload documenti o RAG archivio (altre API `/v1/docs/…` se abilitate).
- Training/fine-tuning del modello: si usa il gateway con modello configurato (`SEMANTIC_CHAT_MODEL`, default `openai/gpt-4o-mini`).

---

## Note per chi collega una UI custom

Minimo viable:

1. `GET status` → mostra “AI disponibile” o messaggio errore.
2. Input testo → `POST ask` → mostra `answer`.
3. Se presente `clarification`, inviare di nuovo `POST` con la scelta nel testo (es. “Uso mese di ingest 2025-06”) finché non c’è risposta definitiva.
4. Pannello opzionale “Mostra passaggi” da `agentSteps` (evidenziare step in `error` per capire retry del modello).

Endpoint sempre sotto **`/t/{tenantId}/v1/chat/ask`** sul gateway pubblico.
