# 01 — Product Thesis

> Palantir serves 0.1% of organizations. We're building the semantic layer for the other 99.9% — starting where the pain is worst: Italian SMEs, then everywhere files and chaos exist.

---

## 1. Il problema, in linguaggio PMI

Una PMI media ha i suoi dati sparsi in un gestionale, tre export CSV, una decina di Excel tribali e la testa del commercialista. Il sintomo è universale e si sente a ogni riunione di bilancio, ogni richiesta di finanziamento, ogni decisione di pricing:

- **Il numero non torna.** Il gestionale dice 312 clienti, il report Excel dice 340, il commercialista ne conta 297. Nessuno sa chi ha ragione. Ogni decisione comincia con due ore di riconciliazione manuale.
- **Nessuno sa quanti clienti attivi c'è.** La domanda più semplice dell'azienda ha due risposte diverse nella stessa riunione, perché "attivo" non è definito da nessuna parte.
- **L'Excel di Gianni.** Un file che capisce solo una persona, con 27 fogli e macro, e Gianni va in pensione a marzo.
- **Gli agenti AI sbagliano in silenzio.** Chi ha comprato un copilota ha scoperto che risponde con numeri immaginati, perché il modello non sa cosa sono *i suoi* dati — inventa la definizione di "cliente attivo" a ogni sessione.

La radice è una sola: **non esiste da nessuna parte una rappresentazione vera e condivisa di cosa sono i dati dell'azienda.** I dati esistono; il loro *significato* no.

## 2. La tesi

> Il significato dei dati di un'organizzazione può essere estratto automaticamente dai dati stessi, mantenuto vivo nel tempo, e consultato da umani e agenti AI come ground truth — a un costo che il 99.9% delle organizzazioni può permettersi.

Tre affermazioni inside questa frase, ciascuna è una scommessa verificabile:

1. **Estraibile**: profilazione deterministica + LLM per l'interpretazione sostituiscono il lavoro umano (i forward-deployed engineers di Palantir) con costo-token. Fino al 2025 era impossibile per aritmetica; ora non lo è più.
2. **Mantenibile**: il valore non è nella mappa una tantum ma nel servizio continuo — re-run, diff, alert quando qualcosa cambia. La mappa drifta da sola in un'azienda viva; chi la tiene aggiornata possiede il rapporto col cliente.
3. **Consultabile**: il modello semantico è utile solo se esposto dove già avviene il consumo — l'agente AI (via MCP/API), la dashboard, l'email di alert. Headless: noi siamo la verità sotto, il cliente sceglie l'interfaccia sopra.

## 3. Cosa vendiamo

**Un modello semantico dell'azienda, mantenuto nel tempo, esposto via API.**

Il momento del valore per il titolare: *"un posto solo dove 'cliente attivo' ha una definizione, la vostra, scritta nero su bianco — e ogni domanda, vostra o dell'AI che avete comprato, riceve lo stesso numero."*

Il momento del valore per lo studio professionale: *"offri ai tuoi clienti PMI l'AI sui dati che già gestisci per loro — con la tua faccia sopra."*

Il momento del valore per un AI verticale (Lexroom & co.): *"il contesto aziendale del vostro cliente, always-on — la feature che trasforma il vostro agente da assistente legale ad assistente del cliente."*

## 4. Cosa NON siamo (non-goals espliciti)

| Non siamo | Perché no |
|---|---|
| Un chatbot / copilota | Il rumore del mercato è pieno di chatbot; noi siamo il layer sotto che li rende corretti. Chi fa la conversazione ha la relazione col cliente — noi abbiamo la verità dei suoi dati. |
| Un ETL / strumento di trasformazione | Non spostiamo né puliamo i dati. I dati restano dove sono; noi estraiamo e manteniamo il loro *significato*. |
| Un connector-universale (Zapier/Nango) | L'integrazione con i sistemi non si unifica a livello di connector (manutenzione N×sistemi) ma a livello semantico: un layer sopra N sorgenti. Le porte d'ingresso sono file, DB readonly, export — formati stabili da 40 anni. |
| Un gestionale / data warehouse | Non sostituiamo nulla. Ci innestiamo sopra ciò che c'è, come Palantir sopra i silos. |
| Enterprise sales | Vendita self-serve via canale studi professionali. Niente gare, niente FDE, niente cicli pluriennali. L'enterprise arriva come conseguenza (quando il formato è standard), mai come strategia iniziale. |
| Consumer | Persone fisiche con 3 Excel delle bollette non sono il mercato. "Tutte le organizzazioni con dati di lavoro", dal professionista singolo al gruppo medio. |

## 5. Perché ora (la finestra)

1. **Il costo della mappa è crollato.** Fino al 2024 modellare un'organizzazione richiedeva umani costosi → solo clienti da $100M+ (Palantir). Gli LLM hanno reso l'estrazione costo-token → il mercato PMI è servibile *per la prima volta*.
2. **La domanda è validata dall'alto.** Palantir: Q2 2026 revenue $1.94B (+93% Y/Y), segmento commerciale US +149%. Databricks (Genie Ontology), Snowflake (Horizon Context), Microsoft (Fabric IQ) stanno embeddendo ontologie — ma *solo dentro i propri ecosistemi*, per lock-in. La posizione neutrale cross-sistema è occupata da nessuno, per conflitto d'interesse strutturale.
3. **Il segmento sotto è vuoto.** In Italia Palantir serve ~4 end-user veri. I "Palantir europei" (Quantexa, Siren, ChapsVision) copiano il modello enterprise-militare. Le AI verticali coprono il singolo dominio, non l'azienda. Nessuno fa il layer per chi non ha budget Kirkland & Ellis.
4. **Gli agenti rendono il problema urgente.** Ogni agente AI che una PMI adotta è un nuovo consumatore (affamato e bugiardo) del significato dei suoi dati. Il pain cresce da solo con l'adozione.

## 6. Perché noi / perché io

- **Il pezzo difficile è già costruito.** La pipeline di Backed (estrazione → rappresentazione versionata → diff semantico → generazione MCP → review UI) è il 70% di questo prodotto con il dominio cambiato: da codice a dati. Il quality-gate culture (BackedBench) si trasla: "una cartella di PMI sconosciuta deve raggiungere un modello utile con meno di 10 conferme umane".
- **L'accesso al territorio è un asset non replicabile.** Fondatore italiano, giro di studi professionali (esperienza Carta): il canale commercialista è la soluzione al problema-fiducia che un competitor di San Francisco non può comprare.
- **Il timing è il vantaggio.** Le condizioni (costo LLM, domanda agenti, incumbent inchiodati) sono visibili a tutti — la finestra è stimata 18-24 mesi prima che qualcuno con funding assembli la stessa combinazione.

## 7. Chi paga, in ordine

1. **Studi commercialisti e consulenti** (fase A, primario): hanno già la fiducia e l'accesso ai dati delle PMI; moltiplicatore 50-200 clienti per studio; il pattern è validato da Palantir stessa (Akin Gump come mini-Foundry per i clienti dello studio).
2. **PMI diretta, self-serve** (fase A, secondario): il titolare curioso, il figlio che gestisce l'Excel di Gianni, chi ha comprato un agente AI ed è rimasto deluso. Funnel puro + segnale di mercato.
3. **AI verticali** (fase B): quando scoprono che ricostruire l'ontologia per ogni cliente gli costa margine. Upsell upstream: "l'ontologia è esportabile — il mantenerla no".
4. **PA e sanità** (fase C, mai come partenza): via canale indiretto (chi già vende a quei mondi), con la versione matura del prodotto, tra 3-5 anni.

## 8. Come vinciamo (i tre nemici, con nome)

1. **Fiducia fragile** (prodotto): la mappa sbagliata è peggio di nessuna mappa. Vinca chi espone la confidenza ovunque, sa dire "non lo so", e manda in review le 10 domande più rischiose — non le prime 10. Il quality gate non è opzione: è il prodotto.
2. **Costo unitario** (economia): le unit economics muoiono sul cliente disordinato, non su quello pulito. Caching aggressivo (re-profilare solo ciò che cambia — il diff serve a questo), LLM economici per la profilazione fine, pricing tarato sul caso peggiore.
3. **Inerzia** (mercato): la PMI non cerca una categoria che non sa nominare. Vendere il dolore ("il numero che non torna"), mai la categoria ("ontologia"); entrare da chi ha già la fiducia, mai cold.

## 9. La metrica del prodotto

**Domande umane per cartella.** Il prodotto è riuscito quando una cartella di PMI sconosciuta raggiunge un modello utile con meno di 10 conferme umane, e ogni re-run successivo ne richiede sempre meno. Tutto il resto (download, login, query) è vanity finché questa non scende.

## 10. Scommessa d'uscita

Se il futuro è "un agente AI per ogni funzione della PMI", il layer che possiede il significato dei dati è l'infrastruttura di tutti — come Stripe sotto ogni e-commerce. Se invece ogni verticale si costruisce la sua ontologia in-house e nessuno sente il costo, questo prodotto non esiste come categoria indipendente.

Il prototipo su 3 cartelle vere di PMI risponde a questa domanda in tre conversazioni: se il titolare vede la mappa dei suoi dati e chiede "posso farlo anch'io?", il futuro è il primo. Se sbadiglia, il secondo. Nessuna analisi risponde al posto di quella faccia.

---

## Decisioni prese in questo documento

- Il prodotto è il **modello semantico mantenuto**, headless, esposto via API/MCP. Non la UI, non l'agente, non il chatbot.
- Le porte d'ingresso sono solo tre: file/cartella/S3, DB readonly, export. Nessun connector dedicato.
- Pricing vende il mantenimento, non la mappa (la mappa è esportabile; il servizio no).
- GTM: studi commercialisti primari, PMI self-serve secondario, verticali fase B, PA fase C.
- Metrica nord: domande umane per cartella.
- Test di verità: 3 cartelle vere di PMI, faccia del titolare. Nessuna decisione strategica ulteriore prima di quel test.

*Prossimo documento: `02-glossary.md` — i nomi delle cose.*
