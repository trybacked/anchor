import { DomainVocabularySchema } from "@backed/core";
import type { DomainVocabulary } from "@backed/core";

export const GERACE_DOMAIN_VOCABULARY: DomainVocabulary = DomainVocabularySchema.parse({
    language: "it",
    numberFormat: "decimal_comma",
    dateOrder: "day_first",
    corpusSummary: "Atti amministrativi del Comune di Gerace: determine, delibere, ordinanze e avvisi",
    entityLabel: "impresa",
    documentTopics: [
        { id: "appalto", label: "Appalto", description: "Affidamento di lavori, servizi o forniture" },
        { id: "pnrr", label: "PNRR", description: "Interventi finanziati dal PNRR" },
        { id: "altro", label: "Altro", description: "Argomento non riconducibile agli altri" },
    ],
    entitySectors: [
        { id: "edilizia", label: "Edilizia", description: "Imprese di costruzioni" },
        { id: "servizi", label: "Servizi", description: "Fornitori di servizi" },
        { id: "altro", label: "Altro", description: "Settore non riconducibile agli altri" },
    ],
    entityRoles: [
        { id: "aggiudicataria", label: "Aggiudicataria", description: "Impresa aggiudicataria" },
        { id: "fornitore", label: "Fornitore", description: "Fornitore di beni o servizi" },
        { id: "altro", label: "Altro", description: "Ruolo non riconducibile agli altri" },
    ],
    factTypes: [
        {
            id: "importo",
            label: "Importo",
            quantity: "currency",
            cues: ["importo", "euro", "€"],
            aggregation: "sum",
            isDefault: true,
        },
    ],
    identifierFormats: [
        {
            id: "cig",
            label: "CIG",
            cues: ["CIG"],
            charset: "alphanumeric",
            minLength: 10,
            maxLength: 10,
        },
    ],
    nameConventions: {
        suffixes: ["srl", "spa", "snc"],
        leadingNoise: ["ditta", "impresa"],
    },
});
