import { DomainVocabularySchema } from "@backed/core";
import type { DomainVocabulary } from "@backed/core";
/** Test fixture: vocabulary as discovered for a public-procurement document corpus. */
export const PROCUREMENT_VOCABULARY: DomainVocabulary = DomainVocabularySchema.parse({
    language: "it",
    numberFormat: "decimal_comma",
    dateOrder: "day_first",
    corpusSummary: "Atti amministrativi di un comune italiano: determine, delibere e avvisi",
    entityLabel: "impresa",
    documentTopics: [
        { id: "appalto", label: "Appalto", description: "Affidamento di lavori, servizi o forniture" },
        { id: "pnrr", label: "PNRR", description: "Interventi finanziati dal PNRR" },
        { id: "tributi", label: "Tributi", description: "Imposte e tasse comunali" },
    ],
    entitySectors: [
        { id: "edilizia", label: "Edilizia", description: "Imprese di costruzioni" },
        { id: "servizi_tecnici", label: "Servizi tecnici", description: "Studi tecnici e progettazione" },
        { id: "altro", label: "Altro", description: "Settore non riconducibile agli altri" },
    ],
    entityRoles: [
        { id: "aggiudicataria", label: "Aggiudicataria", description: "Impresa che si aggiudica l'appalto" },
        { id: "mandante_rti", label: "Mandante RTI", description: "Impresa mandante di un raggruppamento" },
        { id: "altro", label: "Altro", description: "Ruolo non riconducibile agli altri" },
    ],
    factTypes: [
        {
            id: "importo_contrattuale",
            label: "Importo contrattuale",
            quantity: "currency",
            cues: ["importo"],
            aggregation: "sum",
            isDefault: true,
        },
        {
            id: "ribasso_pct",
            label: "Ribasso percentuale",
            quantity: "percentage",
            cues: ["ribasso"],
            aggregation: "max",
            isDefault: false,
        },
        {
            id: "oneri_sicurezza",
            label: "Oneri per la sicurezza",
            quantity: "currency",
            cues: ["oneri", "sicurezza"],
            aggregation: "sum",
            isDefault: false,
        },
        {
            id: "liquidazione",
            label: "Liquidazione",
            quantity: "currency",
            cues: ["liquidazione", "liquidato"],
            aggregation: "sum",
            isDefault: false,
        },
        {
            id: "impegno_spesa",
            label: "Impegno di spesa",
            quantity: "currency",
            cues: ["impegno", "spesa"],
            aggregation: "sum",
            isDefault: false,
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
        {
            id: "piva",
            label: "Partita IVA",
            cues: ["P.IVA", "P. IVA", "Partita IVA"],
            charset: "numeric",
            minLength: 11,
            maxLength: 11,
        },
    ],
    nameConventions: {
        suffixes: ["srl", "spa", "snc", "sas"],
        leadingNoise: ["ditta", "impresa", "societa"],
    },
});
export const ENGLISH_INVOICE_VOCABULARY: DomainVocabulary = DomainVocabularySchema.parse({
    language: "en",
    numberFormat: "decimal_point",
    dateOrder: "month_first",
    corpusSummary: "Supplier invoices and purchase orders of a construction firm",
    entityLabel: "vendor",
    documentTopics: [
        { id: "invoice", label: "Invoice", description: "A billed supply of goods or services" },
        { id: "purchase_order", label: "Purchase order", description: "An order placed with a vendor" },
        { id: "receipt", label: "Receipt", description: "Proof of a settled payment" },
    ],
    entitySectors: [
        { id: "construction", label: "Construction", description: "Building contractors" },
        { id: "logistics", label: "Logistics", description: "Carriers and freight forwarders" },
        { id: "other", label: "Other", description: "Sector matching none of the above" },
    ],
    entityRoles: [
        { id: "supplier", label: "Supplier", description: "Party billing for goods or services" },
        { id: "buyer", label: "Buyer", description: "Party being billed" },
        { id: "other", label: "Other", description: "Role matching none of the above" },
    ],
    factTypes: [
        {
            id: "invoice_total",
            label: "Invoice total",
            quantity: "currency",
            cues: ["total"],
            aggregation: "sum",
            isDefault: true,
        },
        {
            id: "discount_rate",
            label: "Discount rate",
            quantity: "percentage",
            cues: ["discount"],
            aggregation: "max",
            isDefault: false,
        },
        {
            id: "shipping_fee",
            label: "Shipping fee",
            quantity: "currency",
            cues: ["shipping", "freight"],
            aggregation: "sum",
            isDefault: false,
        },
    ],
    identifierFormats: [
        {
            id: "po",
            label: "Purchase order number",
            cues: ["PO", "P.O."],
            charset: "numeric",
            minLength: 4,
            maxLength: 8,
        },
    ],
    nameConventions: {
        suffixes: ["inc", "ltd", "llc"],
        leadingNoise: ["messrs"],
    },
});
