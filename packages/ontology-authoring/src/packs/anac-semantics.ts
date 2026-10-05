import type { SemanticCatalog } from "@trybacked/core";
export const ANAC_CONTRACTS_DATASET = "backed.anac.contracts";
export const ANAC_ORGANIZATIONS_DATASET = "backed.anac.organizations";
const CONTRACTING_AUTHORITY_SYNONYMS = [
  "ente",
  "ente appaltante",
  "enti appaltanti",
  "stazione appaltante",
  "amministrazione appaltante",
  "contracting authority",
  "contracting authorities",
];
export const ANAC_SEMANTIC_CATALOG: SemanticCatalog = {
  id: "anac",
  datasets: {
    [ANAC_CONTRACTS_DATASET]: {
      entity: {
        synonyms: [
          "appalto",
          "appalti",
          "contratto",
          "contratti",
          "gara",
          "gare",
          "contract",
          "tender",
        ],
        labels: {
          it: { singular: "contratto", plural: "contratti" },
          en: { singular: "contract", plural: "contracts" },
        },
        defaultTimeDimension: "source_year_month",
        displayProperties: [
          "cig",
          "oggetto_gara",
          "importo_lotto",
          "denominazione_amministrazione_appaltante",
          "data_pubblicazione",
          "source_year_month",
        ],
      },
      properties: {
        cig: {
          semanticRole: "identifier",
          description: "Codice Identificativo Gara (CIG), unique per contract lot.",
          synonyms: ["codice cig", "codice identificativo gara"],
          labels: { it: "codice CIG", en: "CIG code" },
        },
        source_year_month: {
          semanticRole: "partition",
          valueFormat: "YYYY-MM",
          description:
            "Month the ANAC snapshot was loaded into the warehouse. Default period filter; use eq or in.",
          synonyms: [
            "mese di ingest",
            "mese ingest",
            "mese di caricamento",
            "ingest month",
            "load month",
          ],
          sampleValues: ["2025-06", "2025-05"],
          labels: { it: "mese dei dati", en: "data month" },
        },
        data_pubblicazione: {
          semanticRole: "time_dimension",
          description:
            "Publication date of the tender notice. Use only when the question asks about publication.",
          synonyms: [
            "data di pubblicazione",
            "pubblicato",
            "pubblicati",
            "pubblicate",
            "publication date",
            "published",
          ],
          labels: { it: "data di pubblicazione", en: "publication date" },
        },
        anno_pubblicazione: {
          semanticRole: "time_dimension",
          valueFormat: "YYYY",
          description: "Publication year of the tender notice.",
          synonyms: ["anno di pubblicazione", "publication year"],
        },
        mese_pubblicazione: {
          semanticRole: "time_dimension",
          description: "Publication month of the tender notice; pair with anno_pubblicazione.",
          synonyms: ["mese di pubblicazione", "publication month"],
        },
        data_scadenza_offerta: {
          semanticRole: "time_dimension",
          description: "Deadline for submitting bids.",
          synonyms: ["scadenza", "scadenza offerta", "bid deadline"],
        },
        oggetto_gara: {
          description: "Free-text subject of the tender; filter with contains.",
          synonyms: ["oggetto", "oggetto della gara", "tender subject"],
          labels: { it: "oggetto della gara", en: "tender subject" },
        },
        oggetto_lotto: {
          description: "Free-text subject of the single lot.",
          synonyms: ["oggetto del lotto", "lot subject"],
        },
        importo_lotto: {
          semanticRole: "measure",
          description: "Lot amount in EUR. Default amount for ranking contracts.",
          synonyms: ["importo", "valore", "importo del lotto", "amount", "value"],
          labels: { it: "importo del lotto", en: "lot amount" },
        },
        importo_complessivo_gara: {
          semanticRole: "measure",
          description: "Total tender amount in EUR across all lots.",
          synonyms: ["importo complessivo", "importo totale gara", "total amount"],
        },
        denominazione_amministrazione_appaltante: {
          semanticRole: "label",
          description:
            'Name of the contracting authority, denormalized on the contract row. Also the only way to reach a municipality or a named body: filter with contains on the name in upper case (e.g. "GERACE").',
          synonyms: ["nome ente", "comune", "città", ...CONTRACTING_AUTHORITY_SYNONYMS],
          sampleValues: ["COMUNE DI GERACE", "REGIONE TOSCANA"],
          labels: { it: "ente appaltante", en: "contracting authority" },
        },
        provincia: {
          description:
            'Province where the contract is performed, denormalized on the contract row as an upper-case label ("REGGIO CALABRIA", "ROMA"); filter with contains on the province name. This is the only province field — sezione_regionale holds regions and never matches a province.',
          valueFormat: "<PROVINCIA IN MAIUSCOLO>",
          sampleValues: ["ROMA", "MILANO", "REGGIO CALABRIA"],
          synonyms: ["provincia", "province", "città metropolitana"],
          labels: { it: "provincia", en: "province" },
        },
        luogo_istat: {
          description:
            "ISTAT code of the place of performance. Use only when the question gives an ISTAT code; never to resolve a municipality by name.",
          synonyms: ["codice istat", "luogo istat", "istat code"],
          labels: { it: "codice ISTAT del luogo", en: "ISTAT place code" },
        },
        cf_amministrazione_appaltante: {
          semanticRole: "identifier",
          description: "Fiscal code of the contracting authority; joins to organization.",
        },
        sezione_regionale: {
          description:
            'Regional section (region, never a province) denormalized on the contract row, stored as a label such as "SEZIONE REGIONALE CALABRIA"; filter with contains on the region name. When the question refers to entities / authorities / contracting bodies (not the contract row alone), filter organization.sezione_regionale via organization_has_contracts instead of this field.',
          valueFormat: "SEZIONE REGIONALE <REGIONE>",
          sampleValues: ["SEZIONE REGIONALE CALABRIA", "SEZIONE REGIONALE LOMBARDIA"],
          synonyms: ["regione", "sezione regionale", "region"],
          labels: { it: "regione", en: "region" },
        },
        tipo_scelta_contraente: {
          description: "Procurement procedure type.",
          synonyms: ["procedura", "tipo di procedura", "procedure type"],
        },
        stato: {
          description: "Lifecycle status of the tender.",
          synonyms: ["stato della gara", "status"],
          labels: { it: "stato della gara", en: "tender status" },
        },
      },
    },
    [ANAC_ORGANIZATIONS_DATASET]: {
      entity: {
        synonyms: [
          "organizzazione",
          "organizzazioni",
          "organization",
          ...CONTRACTING_AUTHORITY_SYNONYMS,
        ],
        labels: {
          it: { singular: "ente appaltante", plural: "enti appaltanti" },
          en: { singular: "contracting authority", plural: "contracting authorities" },
        },
        displayProperties: [
          "denominazione_amministrazione_appaltante",
          "cf_amministrazione_appaltante",
          "sezione_regionale",
          "contracts_count",
        ],
      },
      properties: {
        cf_amministrazione_appaltante: {
          semanticRole: "identifier",
          description: "Fiscal code of the contracting authority.",
          synonyms: ["codice fiscale", "fiscal code"],
        },
        denominazione_amministrazione_appaltante: {
          semanticRole: "label",
          description: "Official name of the contracting authority.",
          synonyms: ["nome ente", "denominazione"],
          sampleValues: ["COMUNE DI GERACE", "REGIONE TOSCANA"],
          labels: { it: "nome", en: "name" },
        },
        sezione_regionale: {
          description:
            'Regional section of the contracting authority; stored as a label such as "SEZIONE REGIONALE SICILIA" or "NON CLASSIFICATO", so filter with contains on the region name, never eq.',
          valueFormat: "SEZIONE REGIONALE <REGIONE>",
          sampleValues: ["SEZIONE REGIONALE CALABRIA", "SEZIONE REGIONALE LOMBARDIA"],
          synonyms: ["regione", "sezione regionale", "region"],
          labels: { it: "regione", en: "region" },
        },
        contracts_count: {
          semanticRole: "measure",
          description: "Number of contracts awarded by the authority across loaded months.",
          synonyms: ["numero contratti", "contract count"],
        },
        source_year_months: {
          semanticRole: "partition",
          description: "Ingest months in which the authority appears.",
        },
      },
    },
  },
  glossary: [
    {
      id: "ingest-month",
      term: "mese di ingest",
      definition:
        "Month the ANAC snapshot was loaded (source_year_month, YYYY-MM). Default meaning of a bare month or period in contract questions; distinct from publication date fields.",
      datasetId: ANAC_CONTRACTS_DATASET,
      propertyId: "source_year_month",
    },
    {
      id: "publication-date",
      term: "pubblicati in / data di pubblicazione",
      definition:
        "Use data_pubblicazione (or anno_pubblicazione + mese_pubblicazione) only when the question explicitly asks about publication.",
      datasetId: ANAC_CONTRACTS_DATASET,
      propertyId: "data_pubblicazione",
    },
    {
      id: "contracting-authority",
      term: "ente appaltante",
      definition:
        "The public body awarding the contract. Counting authorities uses organization; contract rows carry its name and fiscal code.",
      datasetId: ANAC_ORGANIZATIONS_DATASET,
    },
    {
      id: "topic-acronyms",
      term: "acronimi nel tema (AI, IA, IoT, PNRR…)",
      definition:
        'Tender subjects (oggetto_gara) are written in Italian and in full: search the expanded Italian wording (AI / IA → "intelligenza artificiale", IoT → "internet delle cose"), not the acronym, which collides with Italian function words such as the preposition "ai". Keep the acronym only when it is the official name of a programme (PNRR, CONSIP).',
      datasetId: ANAC_CONTRACTS_DATASET,
      propertyId: "oggetto_gara",
    },
    {
      id: "province-question",
      term: "provincia (es. provincia di Reggio Calabria)",
      definition:
        'A province is contract.provincia, filtered with contains on the upper-case province name ("REGGIO CALABRIA"). Never answer a province question with sezione_regionale: it holds regions only and would return zero rows.',
      datasetId: ANAC_CONTRACTS_DATASET,
      propertyId: "provincia",
    },
    {
      id: "municipality-question",
      term: "comune / città (es. quanti contratti a Gerace)",
      definition:
        'There is no municipality column. Match the contracting authority instead: denominazione_amministrazione_appaltante contains the municipality name in upper case (e.g. "GERACE"), and state in assumptions that the match is on the authority name. luogo_istat only carries ISTAT codes.',
      datasetId: ANAC_CONTRACTS_DATASET,
      propertyId: "denominazione_amministrazione_appaltante",
    },
    {
      id: "region-topic-question",
      term: "tema + regione (es. gare su un argomento in una regione)",
      definition:
        "Filter contract rows: join organization_has_contracts, organization.sezione_regionale contains the region, and a contains or textSearch on oggetto_gara for the topic. Default to the ingest month when no period is given. One query is enough.",
      datasetId: ANAC_CONTRACTS_DATASET,
      propertyId: "oggetto_gara",
    },
    {
      id: "authority-regional-section",
      term: "entities / authorities with regional section",
      definition:
        "Regional section of the contracting authority lives on organization.sezione_regionale. Count contracts with objectId contract, joins organization_has_contracts, and filters objectId organization plus sezione_regionale — not a lone filter on contract.sezione_regionale when the question names entities.",
      datasetId: ANAC_ORGANIZATIONS_DATASET,
      propertyId: "sezione_regionale",
    },
  ],
  examples: [
    {
      id: "contracts-topic-in-region",
      question: "C'è qualcosa sull'intelligenza artificiale in Calabria?",
      tags: ["join", "region", "text"],
      expectedObjectQuery: {
        objectId: "contract",
        mode: "rows",
        joins: [{ relationshipId: "organization_has_contracts" }],
        filters: [
          { propertyId: "source_year_month", op: "eq", value: "2025-06" },
          {
            objectId: "organization",
            propertyId: "sezione_regionale",
            op: "contains",
            value: "Calabria",
          },
          { propertyId: "oggetto_gara", op: "contains", value: "intelligenza artificiale" },
        ],
        limit: 5,
      },
    },
    {
      id: "contracts-by-region",
      question: "Quanti contratti per regione a giugno 2025?",
      tags: ["join", "region", "breakdown"],
      expectedObjectQuery: {
        objectId: "contract",
        mode: "rows",
        joins: [{ relationshipId: "organization_has_contracts" }],
        filters: [{ propertyId: "source_year_month", op: "eq", value: "2025-06" }],
        groupBy: ["organization.sezione_regionale"],
        aggregations: [{ op: "count", alias: "count" }],
        orderBy: "count",
        orderDirection: "desc",
        limit: 30,
      },
    },
    {
      id: "count-contracts-province",
      question: "Quanti contratti nella provincia di Reggio Calabria?",
      tags: ["count", "province"],
      expectedObjectQuery: {
        objectId: "contract",
        mode: "count",
        filters: [{ propertyId: "provincia", op: "contains", value: "REGGIO CALABRIA" }],
      },
    },
    {
      id: "count-contracts-municipality",
      question: "Quanti contratti a Gerace?",
      tags: ["count", "municipality"],
      notes:
        "No municipality column: the match is on the contracting authority name, which must be stated in assumptions.",
      expectedObjectQuery: {
        objectId: "contract",
        mode: "count",
        filters: [
          {
            propertyId: "denominazione_amministrazione_appaltante",
            op: "contains",
            value: "GERACE",
          },
        ],
      },
    },
    {
      id: "count-contracts-entities-sicilia-smoke",
      question:
        "How many contracts in month 2025-06 involve entities with regional section Sicilia?",
      tags: ["join", "count"],
      expectedObjectQuery: {
        objectId: "contract",
        mode: "count",
        joins: [{ relationshipId: "organization_has_contracts" }],
        filters: [
          { propertyId: "source_year_month", op: "eq", value: "2025-06" },
          {
            objectId: "organization",
            propertyId: "sezione_regionale",
            op: "contains",
            value: "Sicilia",
          },
        ],
      },
    },
    {
      id: "count-contracts-authority-region",
      question:
        "How many contracts in ingest month 2025-06 where the contracting authority has regional section Sicilia?",
      tags: ["join", "count"],
      expectedObjectQuery: {
        objectId: "contract",
        mode: "count",
        joins: [{ relationshipId: "organization_has_contracts" }],
        filters: [
          { propertyId: "source_year_month", op: "eq", value: "2025-06" },
          {
            objectId: "organization",
            propertyId: "sezione_regionale",
            op: "contains",
            value: "Sicilia",
          },
        ],
      },
    },
    {
      id: "count-contracts-multiple-ingest-months",
      question: "How many contracts are in the May and June 2025 ingest months?",
      tags: ["count", "in"],
      expectedObjectQuery: {
        objectId: "contract",
        mode: "count",
        filters: [
          {
            propertyId: "source_year_month",
            op: "in",
            value: ["2025-05", "2025-06"],
          },
        ],
      },
    },
    {
      id: "breakdown-contracts-by-region-section",
      question: "For ingest month 2025-06, count contracts per regional section (top 10).",
      tags: ["groupBy", "breakdown"],
      expectedObjectQuery: {
        objectId: "contract",
        mode: "rows",
        filters: [{ propertyId: "source_year_month", op: "eq", value: "2025-06" }],
        groupBy: ["sezione_regionale"],
        aggregations: [{ op: "count", alias: "count" }],
        orderBy: "count",
        orderDirection: "desc",
        limit: 10,
      },
    },
  ],
};
