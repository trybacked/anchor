# Backed — Visione Generale del Prodotto
> Il semantic layer per il 99.9% delle organizzazioni.

---

## Il pitch

**Palantir serves 0.1% of organizations. We're building the semantic layer for the other 99.9% — starting where the pain is worst: Italian SMEs, then everywhere files and chaos exist.**

---

## 1. Il problema

Ogni organizzazione — PMI, studio professionale, impresa media — ha i suoi dati sparsi in un gestionale, tre export CSV, una decina di Excel tribali e la testa di chi li gestisce. I dati esistono; il loro **significato** no.

I sintomi sono quotidiani e universali:
- **Il numero non torna**: gestionale, Excel e commercialista dicono tre numeri diversi perché "cliente attivo" non è definito da nessuna parte.
- **Il know-how è un single point of failure**: la mappa dei dati vive in una o due teste, e va in pensione con loro.
- **Gli agenti AI sbagliano in silenzio**: rispondono con definizioni inventate, perché nessuno ha mai formalizzato cosa sono *i dati di quell'azienda*. Più AI si adotta, più il problema diventa visibile.

La radice: **non esiste da nessuna parte una rappresentazione vera, condivisa e mantenuta di cosa sono i dati dell'organizzazione.** L'industria ha risolto il trasporto dei dati (ETL, warehouse, API) e non ha mai risolto il significato.

## 2. La tesi

> **Il significato dei dati di un'organizzazione può essere estratto automaticamente dai dati stessi, mantenuto vivo nel tempo, e consultato da umani e agenti AI come ground truth — a un costo che il 99.9% delle organizzazioni può permettersi.**

Tre scommesse verificabili:
1. **Estraibile** — profilazione deterministica + burst agentici LLM sostituiscono il lavoro dell'FDE (forward-deployed engineer) di Palantir con costo-token. Fino al 2025 era impossibile per aritmetica; ora non lo è più.
2. **Mantenibile** — il valore non è la mappa una tantum ma il servizio continuo: re-run, diff, alert. La mappa drifta da sola in un'azienda viva; chi la tiene aggiornata possiede il rapporto col cliente.
3. **Consultabile** — il modello è utile solo dove avviene il consumo: l'agente AI (MCP), la dashboard, l'email di alert. Headless: noi siamo la verità sotto, il cliente sceglie l'interfaccia sopra.

## 3. Il prodotto

**Un modello semantico dell'organizzazione, mantenuto nel tempo, esposto via API.**

```
Sorgenti (dove i dati già sono: cartelle, S3, Postgres readonly — zero migrazione)
   ↓ DuckDB ingest (CSV/Excel/Parquet italiani sporchi inclusi)
   ↓ Profilazione deterministica (SQL: statistiche, chiavi candidate, pattern)
   ↓ Burst agentici LLM (naming di entità/relazioni/regole, confidenza esposta)
   ↓ Review umana (le 10 domande più rischiose — al titolare o al commercialista)
   ↓ modello.yaml ← IL PRODOTTO (entità, relazioni, definizioni, versionato)
   ↓ Consumato da: MCP server per agenti · API per app · diff per alert
```

Anatomia in stile Foundry (Palantir), in miniatura PMI:

| Foundry (Palantir) | Backed | Fase |
|---|---|---|
| Ontology Manager | modello.yaml + review UI (10 domande) | v1 |
| Data Connection | Ingest: tre porte (file, DB readonly, export) | v1 |
| AIP (agenti sull'ontologia) | MCP export / API headless | v1 |
| Object Explorer | Query API (viewer: v2, forse mai — headless) | v2 |
| Action Types (writeback) | campo `action` ← capability IR di Backed-origin | v2/v3 (campo previsto da subito) |
| Marketplace | Registry di ontologie per settore | dopo, se i clienti lo chiedono |
| FDE (il modello di servizio) | review nel cliente + canale studi + abbonamento | l'unica divergenza volontaria |

Primitive del formato (le stesse di Palantir, scala PMI): **object (entity) · link (relation) · action · property** — più `rule/definition`, che Palantir ha ma noi rendiamo esplicito e confermato. L'ontologia di una PMI: 4-15 entità, 5-20 relazioni. Un ordine di grandezza sotto l'enterprise — per questo 10 conferme bastano.

## 4. Perché ora

1. **Il costo della mappa è crollato.** Costruirla richiedeva umani (l'FDE: ~$500k/anno per cliente). Con estrazione assistita: **~$6/anno di token**. Il rapporto è ~100.000×. Il mercato PMI è servibile *per la prima volta*.
2. **La domanda è validata dall'alto.** Palantir Q2 2026: revenue $1.94B, +93% Y/Y, commerciale US +149% — domanda inevasa ben oltre la capacità di deployment dell'incumbent. Databricks/Snowflake/Microsoft embeddano ontologie *solo dentro i propri giardini* (lock-in): la posizione cross-sistema è strutturalmente disponibile a terzi.
3. **Il vento politico.** L'UE ha dichiarato la volontà di un'alternativa europea a Palantir (set 2026). L'alternativa economica per il tessuto europeo non è il clone-FDE: è il layer a costo-token. Sovranità semantica: il significato dei dati delle imprese europee non dipende da tre vendor americani.
4. **Gli agenti rendono il problema urgente.** Ogni agente AI adottato è un nuovo consumatore affamato (e bugiardo) del significato dei dati.

## 5. Chi paga, in ordine

1. **Studi commercialisti e consulenti** (fase A, primario): hanno già fiducia e accesso ai dati delle PMI; 50-200 clienti per studio; pattern validato da Palantir stessa (Akin Gump/Kirkland = mini-Foundry per i clienti dello studio).
2. **PMI diretta, self-serve** (fase A, secondario): funnel puro, `npx`.
3. **AI verticali** (fase B): quando scoprono che ricostruire l'ontologia per ogni cliente costa margine. "L'ontologia è esportabile — il mantenerla no."
4. **PA/sanità** (fase C): via canale indiretto, con la versione matura, tra 3-5 anni. Mai come partenza.

## 6. Posizionamento

- **Non** "il Palantir italiano" (ti definisce copia, ti inchioda al mercato). **Il semantic layer del 99.9%** — europeo per nascita, globale per architettura (`npx` non ha passaporto), Italia come rampa distributiva.
- Palantir non è il competitor: **è la prova di mercato.** Ogni suo numero record è pubblicità per questa tesi.
- Binario sovrano (solo in Italia/UE): "sovranità semantica", layer neutrale, dati che non escono. Attivato *dopo* che il prodotto esiste, mai prima.
- La mossa finale: mai dire noi "il Palantir italiano" — costruire la cosa tale che lo dicano gli altri, su un giornale, a proposito di noi.

## 7. Business model

- **Open core, alla Vercel/Supabase.** Open source: formato (spec pubblica), CLI local-first (tutto gira in locale, i dati non escono), parser delle tre porte, MCP generator. Closed/hosted: registry multi-cliente, re-run schedulati + alert (il mantenimento automatico), portale conferme distribuito, supporto.
- **Lock-in da servizio, non da prigione**: la mappa è esportabile; il mantenerla viva è l'abbonamento.
- **Pricing**: per cliente-PMI modellato + mantenimento; tarato sul cliente disordinato (il caso peggiore), non sul medio. Costo-token reale: ~$6/anno/cliente → margine strutturale enorme al prezzo PMI (€99-299/mese range).
- **Headless**: noi forniamo modello + API; la UI la fanno i clienti (studi, verticali). L'unica nostra UI: la review.

## 8. I tre rischi esistenziali (con la risposta)

1. **Fiducia fragile** (prodotto): una mappa sbagliata è peggio di nessuna mappa. Difesa: confidenza esposta ovunque, capacità di dire "non lo so", review concentrata sulle domande più rischiose. La qualità è il prodotto, non una feature.
2. **Costo unitario** (economia): le unit economics muoiono sul cliente disordinato. Difesa: caching incrementale (re-processare solo ciò che cambia — è il diff), modelli economici per il lavoro fine, pricing sul peggiore.
3. **Inerzia** (mercato): la PMI non cerca una categoria che non sa nominare. Difesa: vendere il dolore ("il numero che non torna"), mai la categoria ("ontologia"); entrare da chi ha la fiducia (studi), mai cold.

## 9. La metrica

**Domande umane per cartella.** Il prodotto è riuscito quando una cartella di PMI sconosciuta raggiunge un modello utile con meno di 10 conferme, e ogni re-run ne richiede sempre meno.

## 10. Il test di verità

**Tre cartelle vere di PMI, tre studi commercialisti, la faccia del titolare.** Se dopo la mappa chiede "posso farlo anch'io?" / "puoi farlo anche per il cliente X?" → la tesi è confermata dal mondo. Se sbadiglia → no. Nessuna analisi risponde al posto di quella faccia.

---

## Non-goals (perimetro negativo, per proteggere il focus)

Non siamo: un chatbot, un ETL, un connector-universale, un gestionale, un data warehouse. Non facciamo: enterprise sales, gare, PA come partenza, military/defense. Non vendiamo: consulenza, progetti. Non costruiamo: connector dedicati per ogni gestionale (unifichiamo a significato, non a cavo), UI per i clienti (headless), modelli propri (consumiamo API).

---

*Documento di visione — v1.0, settembre 2026. I dettagli operativi sono in `03-plan-fase-uno.md`.*
