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
        },
        oggetto_lotto: {
          description: "Free-text subject of the single lot.",
          synonyms: ["oggetto del lotto", "lot subject"],
        },
        importo_lotto: {
          semanticRole: "measure",
          description: "Lot amount in EUR. Default amount for ranking contracts.",
          synonyms: ["importo", "valore", "importo del lotto", "amount", "value"],
        },
        importo_complessivo_gara: {
          semanticRole: "measure",
          description: "Total tender amount in EUR across all lots.",
          synonyms: ["importo complessivo", "importo totale gara", "total amount"],
        },
        denominazione_amministrazione_appaltante: {
          semanticRole: "label",
          description: "Name of the contracting authority, denormalized on the contract row.",
          synonyms: ["nome ente", ...CONTRACTING_AUTHORITY_SYNONYMS],
        },
        cf_amministrazione_appaltante: {
          semanticRole: "identifier",
          description: "Fiscal code of the contracting authority; joins to organization.",
        },
        sezione_regionale: {
          description:
            "Regional section denormalized on the contract row. When the question refers to entities / authorities / contracting bodies (not the contract row alone), filter organization.sezione_regionale via organization_has_contracts instead of this field.",
          synonyms: ["regione", "sezione regionale", "region"],
        },
        tipo_scelta_contraente: {
          description: "Procurement procedure type.",
          synonyms: ["procedura", "tipo di procedura", "procedure type"],
        },
        stato: {
          description: "Lifecycle status of the tender.",
          synonyms: ["stato della gara", "status"],
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
        },
        sezione_regionale: {
          description: "Regional section of the contracting authority (e.g. Sicilia, Lombardia).",
          synonyms: ["regione", "sezione regionale", "region"],
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
            op: "eq",
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
            op: "eq",
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
