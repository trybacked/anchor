# 04 — Il formato `modello.yaml`

> Lo spec del prodotto. Tutto il resto della pipeline esiste per produrre, mantenere e servire questo file.
> Versione formato: **1**. Schema di validazione: `SemanticModelSchema` in `@backed/core`.

---

## 1. Cos'è

`modello.yaml` è la rappresentazione condivisa e versionata del **significato** dei dati di un'organizzazione: quali entità esistono (Cliente, Fattura, Prodotto), come sono collegate, e quali regole/definizioni valgono ("cliente attivo = almeno una fattura negli ultimi 12 mesi").

Non contiene dati: contiene il **modello** dei dati. Vive nella root del workspace del cliente, accanto a `.backed/`, ed è il risultato della pipeline `ingest → profile → semantic → review`.

Convenzioni:

- **Chiavi YAML in inglese** (il file è consumato da codice e agenti), **valori leggibili in italiano** (`name`, `description`, `definition` sono copy per l'utente PMI).
- Ogni elemento inferito porta **confidenza** (`confidence`, 0..1) e **provenienza** (`provenance`: da quale tabella/colonna/evidenza statistica nasce l'inferenza). Nessuna inferenza anonima: se non si sa da dove viene, non entra nel modello.
- Scala PMI: 4–15 entità, 5–20 relazioni. Un modello più grande è un segnale di errore di inferenza, non di ricchezza.

## 2. Le primitive

Le stesse di un'ontologia Foundry, in miniatura PMI:

| Primitiva | Chiave YAML | Cosa rappresenta | Esempio PMI |
|---|---|---|---|
| **Entity** | `entities` | Un oggetto di business, tipicamente ancorato a una tabella sorgente | Cliente, Fattura, Prodotto |
| **Property** | `entities[].properties` | Un attributo dell'entità, ancorato a una colonna | `partita_iva` del Cliente |
| **Relation** | `relations` | Un collegamento tra due entità, ancorato a coppie di colonne | Fattura → Cliente via `cliente_id` |
| **Rule / Definition** | `rules` | Una definizione di business in italiano, confermata dall'umano | "cliente attivo" |
| **Action** | `actions` | **Riservato** (writeback, fase 2/3). Il campo esiste nel formato, l'implementazione no. | — |

Eredità dal capability-IR del repo precedente: la terna `confidence` + `evidence/provenance` + `reviewDecision` per elemento. Qui la review decision è modellata come `status` e la provenienza punta a tabelle/colonne invece che a file di codice.

## 3. Struttura del file

```yaml
metadata:
  formatVersion: "1"          # versione dello spec, non del modello
  runId: 20260903T191233-4f2a # run che ha generato il file
  generatedAt: 2026-09-03T19:12:33.000Z
  sourceDir: ./sorgenti       # cartella profilata (opzionale)

entities:
  - id: cliente               # slug stabile, chiave per relations/rules
    name: Cliente             # nome leggibile, italiano
    description: Anagrafica dei clienti dell'azienda
    sourceTable: clienti      # tabella DuckDB di provenienza
    status: confirmed         # proposed | confirmed | renamed
    confidence: 0.95
    provenance:
      table: clienti
      evidence: "8 righe, chiave candidata id, colonne anagrafiche (partita_iva, email)"
    properties:
      - name: Partita IVA
        columnName: partita_iva
        semanticType: vat_number   # vedi §4
        role: attribute            # primary_key | foreign_key | attribute
        nullable: false
        confidence: 0.98
        provenance:
          table: clienti
          column: partita_iva
          evidence: "pattern partita IVA su 100% dei valori campionati"

relations:
  - id: fattura-cliente
    name: Fattura emessa a Cliente
    fromEntity: fattura
    toEntity: cliente
    fromColumn: cliente_id
    toColumn: id
    cardinality: one_to_many   # one_to_one | one_to_many | many_to_many
    status: confirmed
    confidence: 0.9
    provenance:
      table: fatture
      column: cliente_id
      evidence: "valori di cliente_id contenuti nei valori di clienti.id"

rules:
  - id: fattura-insoluta
    name: Fattura insoluta
    definition: Una fattura è insoluta quando lo stato vale "insoluta".
    appliesTo: fattura
    column: stato
    status: proposed
    confidence: 0.7
    provenance:
      table: fatture
      column: stato
      evidence: "3 valori distinti: pagata, emessa, insoluta"

actions: []                   # riservato — vuoto in Fase 1
```

## 4. Tipi semantici delle property

`semanticType` classifica il significato, non il tipo SQL (quello resta in `profile.json`):

`text · number · amount · date · boolean · identifier · email · vat_number · fiscal_code · category`

`category` = colonna a bassa cardinalità con valori enumerabili (es. `stato` della fattura): è il candidato naturale per le regole.

## 5. Confidenza, provenienza, status

- `confidence` (0..1): quanto il sistema crede all'inferenza. Sotto la soglia (`LOW_CONFIDENCE_THRESHOLD` in core) l'elemento genera un dubbio o una domanda di review — mai un'invenzione silenziosa.
- `provenance`: `table` (obbligatoria), `column` (se puntuale), `evidence` (frase che riassume l'evidenza statistica). È il "perché" leggibile di ogni riga del modello.
- `status`:
  - `proposed` — inferito, non ancora visto da un umano;
  - `confirmed` — confermato in review (risposta Sì);
  - `renamed` — confermato con nome corretto dall'umano (risposta Rinomina).
  - Un elemento rifiutato in review (risposta No) **non compare** nel modello: il file contiene solo ciò che esiste.

## 6. Il ciclo di vita e gli artefatti collegati

```
profile.json    → evidenza statistica (ProfileReportSchema)
proposal.json   → proposta LLM: modello candidato + dubbi + domande (ProposalSchema)
review.json     → risposte umane Sì/No/Rinomina (ReviewSchema)
modello.yaml    → proposta + risposte applicate (SemanticModelSchema)  ← IL PRODOTTO
diff.json       → differenze tra run (ModelDiffSchema)
```

- `proposal.json` contiene gli stessi elementi del modello (status `proposed`) più: `doubts` (i "non lo so" espliciti del modello LLM — output valido, non errore) e `questions` (max `MAX_REVIEW_QUESTIONS = 10`, ordinate per rischio = impatto × incertezza, ognuna con evidenza in mini-tabella).
- `review.json` registra le risposte; `applyReview` (in core, deterministico) le applica alla proposta e produce il modello finale.
- `diff.json` confronta due run: tabella/colonna nuova o sparita, tipo cambiato, entità sparita, relazione nuova/rotta.

Tutti gli artefatti vivono in `.backed/runs/<runId>/`; `modello.yaml` vive nella root del workspace. Ogni artefatto è validato Zod in lettura e scrittura.

## 7. Cosa NON è nel formato (Fase 1)

- Nessun writeback: `actions` è solo un campo riservato.
- Nessuna metrica/misura calcolata: le regole sono definizioni testuali confermate, non formule eseguibili.
- Nessun riferimento a sorgenti remote o credenziali: il modello è portabile e committabile.
