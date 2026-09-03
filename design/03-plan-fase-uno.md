# Backed — Piano Operativo Fase 1
> Dal formato alla CLI local-first, con le 3 cartelle vere come test di verità.
> Durata: 8 settimane. Risorse: 1 founder + Cursor + ~€100-300/mese (token LLM, Railway, dominio).

---

## 0. Cosa si builda in Fase 1 (e cosa no)

**In Fase 1:**
- Lo spec pubblico del formato (`modello.yaml` / capability-IR adattato)
- La CLI open source, local-first: `init` → `model` → `review` → `diff` → `serve`
- Il re-run incrementale + il diff (il mantenimento in forma locale)
- L'MCP export (riuso del generator Backed)

**NON in Fase 1:** SDK, hosted cloud, registry, portale studi, azioni/writeback (solo il campo nel formato), viewer/dashboard, billing, integrazioni gestionali dedicate, qualsiasi feature richiesta da nessuno.

**Regola di ammissione feature future:** "questa cosa nel mondo Foundry a quale riga corrisponde?" Se è una feature-app che Palantir lascia costruire ai clienti → la costruisce il cliente, non noi.

---

## 1. Le due settimane di design (giorni 1-15) — dove siamo ora

Doc da scrivere, in ordine di priorità:

| Doc | Contenuto | Stato |
|---|---|---|
| `01-product-thesis.md` | tesi, non-goals, buyer, rischi, metrica | ✅ scritto |
| `02-general-vision.md` | visione completa del prodotto (questa coppia di doc) | ✅ scritto |
| `03-plan-fase-uno.md` | questo piano | ✅ (questo doc) |
| `04-model-format.md` | **LO SPEC DI modello.yaml — priorità massima, il sole del sistema** | 🔴 prossimo |
| `05-glossary.md` | Sorgente, Dataset, Entità, Attributo, Relazione, Regola, Run, Diff, Review, Confidenza, Provenienza — ogni termine 2 righe + esempio PMI | 🔴 |
| `06-sources-and-ingestion.md` | le tre porte + i casi patologici (encoding, `;`, decimali con virgola, date 4 formati, header su riga 3, export_clienti_final_v2) | 🔴 |
| `07-semantic-inference.md` | i burst agentici: compiti, budget token/passi, tools (query DuckDB readonly), output schema fisso, "non lo so" come risposta valida. Architettura: **agents where they think, pipelines where they repeat** | 🔴 |
| `08-review-experience.md` | come si selezionano le 10 domande (per rischio, non per semplicità), copy italiano, metrica | 🟡 |
| `09-diff-and-versioning.md` | semantica del diff, versioning git-like, cosa va a review, l'email/alert in locale = report | 🟡 |
| `10-consumption-api.md` | spec MCP export + query API headless | 🟡 |
| `11-architecture.md` | struttura con la mappa Foundry→Backed come portante, riuso esplicito dei package | 🟡 |
| `12-risks-open-questions.md` | i tre rischi + le domande aperte scritte | 🟡 |

Schemi iPad (S1-S9, in `design/diagrams/`): disegnare prima **S5 (grafo dell'ontologia della PMI fittizia)** e **S6 (il yaml annotato)** — dove la matita si ferma è la domanda aperta.

**Compito parallelo, non rinviabile (settimana 2-3):** procurarsi le 3 cartelle vere. Chiamare 3 studi commercialisti del territorio: *"sto costruendo un tool sui dati; posso provarlo su export anonimizzati di un tuo cliente? 30 minuti."* Senza dati veri le settimane 5-6 non esistono. È il compito più importante della fase ed è commerciale, non tecnico.

**Reviewer ufficiale:** Chinè. Thesis e poi ogni doc decisivo passano dalle sue obiezioni prima del pubblico. Ogni obiezione → una riga nel doc 12.

**Chiusura design: giorno 15 si tocca codice, perfetti o no.**

---

## 2. Settimane 3-4 — Ingest + profilazione (deterministico)

**Obiettivo:** `npx backed model ./cartella` produce un report di profilazione completo. Niente LLM, niente UI: solo evidenza statistica.

- [ ] Package `ingest`: DuckDB-wrapper Node (binding ufficiali) — read_csv_auto, Excel, Parquet, JSON, Postgres attach readonly, S3/HTTP
- [ ] Casi patologici italiani: encoding win-1252, `;`, virgola decimale, header non riga 1 — autodetect + **segnalazione** (mai fallire in silenzio)
- [ ] Package `profile` (SQL puro): per colonna — null%, distinct, top values, distribuzione, pattern (PIVA/check-digit, codice fiscale, date, email, importi), chiavi candidate
- [ ] Per coppia di colonne: overlap di valori → candidato relazione, con confidenza deterministica
- [ ] Output: `profile.json` (l'evidenza — è l'input di tutto ciò che viene dopo)
- [ ] Riuso: adapters dalla pipeline Backed (parsers→graph), zero riscritture dell'IR

**Compito commerciale (continuativo da qui):** 1 studio chiamato a settimana. Sempre.

---

## 3. Settimane 5-6 — Il momento della verità: burst agentici + review + le 3 cartelle

**Obiettivo:** le 3 cartelle vere entrano nella pipeline. Si misura la metrica.

- [ ] Package `semantic`: burst agentici (LLM API) — input: profili compressi (mai dati grezzi — minimizzazione GDPR per costruzione); output: schema fisso (entità, relazioni, definizioni proposte, confidenza, dubbi espliciti)
- [ ] Model routing: economico per classificazione/profilazione fine, frontier solo per entità ambigue e definizioni di business
- [ ] Selezione delle domande di review: **per rischio decrescente**, max 10; ogni domanda con l'evidenza sotto (mini-tabella)
- [ ] Review UI (riuso web app Backed): Sì / No / Rinomina + contatore "4 di 10"
- [ ] **RUN DELLA VERITÀ:** puntare sulle 3 cartelle vere. Misurare: domande umane per cartella (obiettivo <10), relazioni sbagliate, non-riconoscimenti, comportamento sui casi ambigui (dichiara "non so" o inventa?)
- [ ] **Mostrare la mappa ai 3 studi.** La domanda che ascolti: *"puoi farlo anche per il cliente X?"* Se arriva → pipeline. Se sbadigliano → i numeri parlano, si corregge o si ammette.
- [ ] Registrare la run migliore: è la demo-arma.

**Concierge MVP, con la curva obbligatoria:** dove la pipeline si inceppa si interviene a mano (Claude Code) — ogni intervento è un ticket da automatizzare. Cliente 1: 60% a mano → cliente 2: 30% → cliente 3: 10%. Metrica settimanale: **ore a mano per cliente, in discesa.** Se dopo 3 clienti è ancora tutto a mano, ci siamo consegnati alla consulenza senza accorgercene.

---

## 4. Settimane 7-8 — Diff + MCP + confezione

**Obiettivo:** il prodotto v1 in forma pubblica.

- [ ] `backed diff`: confronto tra run (riuso Semantic Diff Engine Backed) — colonna nuova, tipo cambiato, relazione rotta, entità sparita; solo le novità ri-passano dall'LLM, solo le incertezze passano all'umano
- [ ] `backed serve`: MCP server in locale (riuso generator Backed) — l'agente del cliente consulta l'ontologia
- [ ] README pubblico col pitch del 99.9% + license MIT/Apache (NON AGPL: il B2D deve integrare senza paura)
- [ ] Repo pubblico (open core: formato + CLI + parser + generator; hosted/cloud resta fuori)
- [ ] Sito one-pager: pitch + waitlist
- [ ] Pricing founding customer: €50-100/mese per i primi 3 studi (mai gratis: chi non paga non testa) — in cambio: dati veri, feedback settimanale, endorsement pubblico quando funziona
- [ ] Ripartenza piano LinkedIn: blocco C (build in public) con i **numeri veri delle run** — mai numeri inventati

---

## 5. Le tre metriche di vita o morte (settimane 9-16)

| Metrica | Obiettivo | Cosa dice |
|---|---|---|
| Domande umane per cartella | <10 e in discesa run dopo run | La qualità del prodotto (rischio 1) |
| Costo-token per cliente / prezzo | <30% | Le unit economics sul caso peggiore (rischio 2) |
| Studi che propongono il tool ai clienti **senza che tu lo chieda** | ≥1 entro la settimana 12 | L'inerzia è vinta dal canale (rischio 3) |

Tutte e tre sì → si cresce, si pensa al seed e alla fase B (vertical AI). Una no → si corregge la parte corrispondente. Due no → si ammette, e il test del thesis (la faccia del titolare) decide se la tesi regge in un'altra forma. Il piano muore o vive su questi numeri — tutto il resto è rumore.

---

## 6. Le regole della fase (il patto, per iscritto)

1. **Un'idea sola fino a marzo.** Nessuna notizia calda ("l'UE cerca l'alternativa a Palantir!", "Anthropic ha lanciato...") cambia il piano: diventa una riga in un doc, non un pomeriggio.
2. **Ogni settimana ha un deliverable verificabile** — un doc, una run, una chiamata. Settimana senza deliverable = settimana in cui il ciclo riavanza.
3. **Il contatto con sconosciuti è settimanale**, non una fase: 1 studio/settimana dalla settimana 3.
4. **Niente rebuild di Backed "per pulizia"**: si riusa, si riorienta. L'IR, il diff, il generator MCP, la review UI si toccano il minimo indispensabile.
5. **Le 3 cartelle vere non si delegano mai**: le call, le facce, i dati — sono il mercato che parla.
6. **Concierge con obbligo di automazione**: il "fatto io" è una strada a senso unico verso il prodotto, mai un parcheggio.
7. **Il nome definitivo non è un compito della fase**: il prodotto si chiama Backed finché la demo non esiste. Ersilia o altro si decide a settimana 8, non prima — il nome non fa la pipeline.

---

## 7. Cosa NON fare in Fase 1 (perimetro negativo della fase)

- Niente gare, PA, enterprise, difesa — nemmeno se l'UE chiama.
- Niente SDK: si builda quando il primo cliente dice con cosa vuole integrarsi.
- Niente hosted/registry/billing: fase 2, dopo i founding customers.
- Niente consulenza parallela per "pagare le bollette": il context-switching costa più del reddito.
- Niente seconda idea, secondo prodotto, secondo canale da esplorare. Una cosa sola.

---

*Fase 1 termina con: repo pubblico, CLI funzionante su 3 cartelle vere, 3 founding customers, tre metriche misurate. Il resto del prodotto (SDK, hosted, registry, azioni) è definito in `02-general-vision.md` e si costruisce solo su pull dei clienti.*